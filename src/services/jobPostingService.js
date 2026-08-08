const { Op } = require('sequelize');
const { createCrudService } = require('./crudFactory');
const { CustomError } = require('../middlewares/error');
const { JobPosting, Candidate } = require('../models');

const crud = createCrudService({
  model: JobPosting,
  entityType: 'JobPosting',
  searchable: ['title', 'department', 'location'],
  allowed: [
    'title', 'slug', 'department', 'departmentId', 'location', 'employmentType',
    'experience', 'summary', 'description', 'responsibilities', 'requirements',
    'closesAt', 'openings',
    // `status` is NOT writable here — it moves through setStatus() so that
    // publishing a role is a deliberate act with its own validation, not a
    // field somebody can flip while editing the job description.
  ],
});

// Slugs are derived from the title when not given, because nobody wants to
// invent one — but they are stored, not computed on read: a slug that changed
// whenever the title was edited would break every link already shared.
const slugify = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

async function uniqueSlug(base, ignoreId = null) {
  const root = slugify(base) || 'role';
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const where = { slug: candidate };
    if (ignoreId) where.id = { [Op.ne]: ignoreId };
    // eslint-disable-next-line no-await-in-loop
    if (!await JobPosting.findOne({ where })) return candidate;
  }
  throw new CustomError('Could not derive a unique slug for this title', 409, 'CONFLICT');
}

async function create(body) {
  const slug = await uniqueSlug(body.slug || body.title);
  return JobPosting.create({ ...body, slug, status: 'draft' });
}

async function update(id, body) {
  const row = await crud.getById(id);
  const patch = { ...body };
  // Only re-derive the slug when it was explicitly supplied. Editing a title
  // must not silently move the public URL.
  if (body.slug) patch.slug = await uniqueSlug(body.slug, id);
  delete patch.status;
  await row.update(patch);
  return row;
}

// A published posting is a public page; refusing beats advertising a role with
// an empty heading and no body.
function assertPublishable(row) {
  if (!row.title || !row.description) {
    throw new CustomError(
      'A job needs a title and a description before it can be published.',
      400, 'VALIDATION_ERROR',
    );
  }
}

async function setStatus(id, status) {
  const row = await crud.getById(id);
  if (status === 'published') assertPublishable(row);
  await row.update({ status, approvalNote: null });
  return row;
}

// ── Approval workflow ──────────────────────────────────────────────────────
// Submitting a draft for approval is a request, not a publish: it enters
// `pending_approval` ("waiting for approval") and stays off the public site
// until an approver publishes it. Kept distinct from setStatus so the caller
// asks for the right thing and the validation lives with the transition.
async function submitForApproval(id) {
  const row = await crud.getById(id);
  assertPublishable(row);
  if (!['draft', 'closed'].includes(row.status)) {
    throw new CustomError(`A ${row.status} posting cannot be submitted for approval`, 409, 'CONFLICT');
  }
  await row.update({ status: 'pending_approval', approvalNote: null });
  return row;
}

async function approve(id) {
  const row = await crud.getById(id);
  if (row.status !== 'pending_approval') {
    throw new CustomError('Only a posting awaiting approval can be approved', 409, 'CONFLICT');
  }
  assertPublishable(row);
  await row.update({ status: 'published', approvalNote: null });
  return row;
}

// Rejecting sends it back to draft WITH a reason, so the poster can fix and
// resubmit rather than being bounced silently.
async function rejectApproval(id, note) {
  const row = await crud.getById(id);
  if (row.status !== 'pending_approval') {
    throw new CustomError('Only a posting awaiting approval can be rejected', 409, 'CONFLICT');
  }
  await row.update({ status: 'draft', approvalNote: note || null });
  return row;
}

// Deleting a posting that has applications would orphan them — the candidates
// would survive with a jobPostingId pointing at nothing, and a recruiter would
// see applications for a role that no longer exists. Closing is what people
// actually want; this says so instead of failing on a foreign key later.
async function remove(id) {
  const applications = await Candidate.count({ where: { jobPostingId: id } });
  if (applications > 0) {
    throw new CustomError(
      `This role has ${applications} application(s) attached. Close it instead of deleting `
      + 'it, so the applications keep the role they were for.',
      409, 'HAS_APPLICATIONS',
    );
  }
  return crud.remove(id);
}

// The list HR sees, with the number of applications per role — the one number
// that makes the screen worth opening. `?status=` drives the Active / Waiting
// for approval / Closed / Draft tabs.
async function list(query = {}) {
  const filters = {};
  if (query.status) filters.status = query.status;
  const result = await crud.list({ ...query, filters });
  const rows = result.data || [];
  const counts = await Candidate.findAll({
    attributes: ['jobPostingId', [Candidate.sequelize.fn('COUNT', '*'), 'n']],
    where: { jobPostingId: { [Op.in]: rows.map((r) => r.id) } },
    group: ['jobPostingId'],
    raw: true,
  });
  const byJob = Object.fromEntries(counts.map((c) => [c.jobPostingId, Number(c.n)]));
  return {
    ...result,
    data: rows.map((r) => ({ ...r.toJSON(), applicationCount: byJob[r.id] || 0 })),
  };
}

module.exports = {
  ...crud, list, create, update, remove, setStatus, slugify,
  submitForApproval, approve, rejectApproval,
};
