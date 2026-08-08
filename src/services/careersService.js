const { Op } = require('sequelize');
const { CustomError } = require('../middlewares/error');
const { JobPosting, Candidate } = require('../models');
const storage = require('../helper/objectStorage');
const Logger = require('../helper/logger');

// THE PUBLIC CAREERS SITE, and the seam where it meets the recruitment pipeline.
//
// Replaces the Google Apps Script backend, which read jobs from a Sheet and
// appended applications to another Sheet with the CV on Drive. The point of
// moving it is not that Sheets is untidy — it is that an application was a row
// in a spreadsheet nobody's workflow touched. Here an application becomes a
// `candidate`, which is the same record the workspace Candidates screen already
// advances through applied → screening → interview → offer → hired, and which
// `recruitmentService.hire()` converts into an Employee in onboarding. The
// careers site now feeds employee onboarding directly.
//
// EVERY READ HERE IS PUBLIC, so each one is deliberately narrow: only published
// postings, only the fields a candidate should see. `listPublic` selects an
// explicit attribute list rather than excluding a few — a new internal column
// (a salary band, an internal note) then defaults to private instead of leaking
// the moment somebody adds it.

const PUBLIC_ATTRIBUTES = [
  'id', 'slug', 'title', 'department', 'location', 'employmentType',
  'experience', 'summary', 'description', 'responsibilities', 'requirements',
  'openings', 'closesAt', 'createdAt',
];

const isOpen = (job) => job.status === 'published'
  && (!job.closesAt || new Date(job.closesAt) > new Date());

// The shape the careers site already expects, so `careersApi.js` maps rather
// than the UI changing. `applyClosed` is computed here because the client must
// not re-derive a closing rule from a date and drift from what the POST will
// actually accept.
const toPublicJob = (job) => ({
  ...job.toJSON ? job.toJSON() : job,
  applyClosed: !isOpen(job),
});

async function listPublic() {
  const jobs = await JobPosting.findAll({
    where: { status: 'published' },
    attributes: PUBLIC_ATTRIBUTES,
    order: [['createdAt', 'DESC']],
  });
  return { data: jobs.map(toPublicJob), totalCount: jobs.length };
}

// Accepts the slug OR the id: links in the wild use the slug, but anything
// internal that already holds an id should not have to look one up.
async function getPublic(idOrSlug) {
  const job = await JobPosting.findOne({
    where: { [Op.or]: [{ slug: idOrSlug }, { id: idOrSlug }], status: 'published' },
    attributes: PUBLIC_ATTRIBUTES,
  });
  if (!job) throw new CustomError('Job not found', 404, 'NOT_FOUND');
  return toPublicJob(job);
}

// A person's name arrives as one field from the form; the pipeline stores it
// split. Splitting on the LAST space keeps multi-word given names intact
// ("Mary Anne Smith" -> "Mary Anne" + "Smith"), which the first-space split
// gets wrong for a large share of real names.
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PUBLIC WRITE. The only one on this service, so the validation is here rather
// than trusted from the caller.
async function apply({
  jobId, name, email, phone, linkedin, note, resume,
}) {
  const job = await JobPosting.findOne({
    where: { [Op.or]: [{ slug: jobId }, { id: jobId }] },
  });
  if (!job) throw new CustomError('Job not found', 404, 'NOT_FOUND');
  if (!isOpen(job)) {
    throw new CustomError('This role is no longer accepting applications.', 409, 'CLOSED');
  }

  if (!name || !String(name).trim()) {
    throw new CustomError('name is required', 400, 'VALIDATION_ERROR');
  }
  if (!EMAIL_RE.test(String(email || '').trim())) {
    throw new CustomError('a valid email is required', 400, 'VALIDATION_ERROR');
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // One application per person per role. A duplicate is almost always a double
  // submit or an impatient retry, and it is refused with a message that says so
  // rather than quietly creating a second candidate for a recruiter to
  // reconcile by hand.
  const existing = await Candidate.findOne({
    where: { email: cleanEmail, jobPostingId: job.id },
  });
  if (existing) {
    throw new CustomError(
      'You have already applied for this role. We have your application.',
      409, 'ALREADY_APPLIED',
    );
  }

  // The CV is stored FIRST, because a candidate row with a resumeKey pointing
  // at an object that failed to upload is worse than no row: it looks complete
  // and cannot be actioned. If the upload throws, nothing is written.
  let resumeKey = null;
  if (resume) {
    const stored = await storage.putResume(resume);
    resumeKey = stored.key;
  }

  const { firstName, lastName } = splitName(name);
  const candidate = await Candidate.create({
    firstName,
    lastName,
    email: cleanEmail,
    phone: phone ? String(phone).trim() : null,
    positionTitle: job.title,
    jobPostingId: job.id,
    departmentId: job.departmentId || null,
    source: 'careers-site',
    resumeKey,
    // Both are candidate-supplied free text and belong together in the one
    // place a recruiter reads.
    notes: [
      linkedin ? `LinkedIn: ${String(linkedin).trim()}` : null,
      note ? String(note).trim() : null,
    ].filter(Boolean).join('\n\n') || null,
    stage: 'applied',
  });

  Logger.info(`[careers] application received for "${job.title}" (${cleanEmail})`);

  // Deliberately returns almost nothing. This is an unauthenticated endpoint;
  // echoing the stored record back would confirm what is on file to anyone who
  // can guess an email address.
  return { success: true, applicationId: candidate.id };
}

// Authenticated: stream a CV to a recruiter. The object is private and this is
// the only way to read one.
async function resumeStream(candidateId) {
  const candidate = await Candidate.findByPk(candidateId);
  if (!candidate) throw new CustomError('Candidate not found', 404, 'NOT_FOUND');
  if (!candidate.resumeKey) throw new CustomError('No résumé on file', 404, 'NOT_FOUND');
  const object = await storage.getResume(candidate.resumeKey);
  return { object, candidate };
}

module.exports = {
  listPublic, getPublic, apply, resumeStream, PUBLIC_ATTRIBUTES,
};
