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

async function setStatus(id, status) {
  const row = await crud.getById(id);
  if (status === 'published') {
    // A published posting is a public page; refusing here beats advertising a
    // role with an empty description.
    if (!row.title || !row.description) {
      throw new CustomError(
        'A job needs a title and a description before it can be published.',
        400, 'VALIDATION_ERROR',
      );
    }
  }
  await row.update({ status });
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
// that makes the screen worth opening.
async function list(query) {
  const result = await crud.list(query);
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
};
