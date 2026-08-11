const { createCrudService } = require('./crudFactory');
const { CustomError } = require('../middlewares/error');
const {
  Candidate, Employee, CandidateStageEvent, InterviewRound, JobOffer, JobPosting,
} = require('../models');

const crud = createCrudService({
  model: Candidate,
  entityType: 'Candidate',
  searchable: ['firstName', 'lastName', 'email', 'positionTitle'],
  allowed: ['firstName', 'lastName', 'email', 'phone', 'positionTitle',
    'departmentId', 'designationId', 'source', 'resumeKey', 'notes', 'jobPostingId'],
});

// The full pipeline. `hired` is deliberately NOT reachable through advanceStage —
// becoming an employee is a conversion (hire / accepted offer), not a label flip,
// so it goes through hire() where the Employee row is created.
const STAGES = ['applied', 'screening', 'shortlisted', 'interview', 'selected', 'offer', 'hired', 'rejected', 'withdrawn'];
const ADVANCEABLE = STAGES.filter((s) => s !== 'hired');

// Record the move and the current stage together, so the column and its history
// can never drift. Best-effort actor: null for a system move (e.g. an accepted
// offer flipping the candidate to `hired`).
async function recordStage(candidate, toStage, { byUserId = null, note = null } = {}) {
  const fromStage = candidate.stage;
  if (fromStage === toStage) return candidate;
  await candidate.update({ stage: toStage });
  await CandidateStageEvent.create({
    candidateId: candidate.id, fromStage, toStage, byUserId, note,
  });
  return candidate;
}

async function advanceStage(id, stage, { byUserId = null, note = null } = {}) {
  if (!ADVANCEABLE.includes(stage)) {
    if (stage === 'hired') {
      throw new CustomError(
        'Use hire (or accept the offer) to mark a candidate hired — it creates the employee record.',
        400, 'VALIDATION_ERROR',
      );
    }
    throw new CustomError(`stage must be one of ${ADVANCEABLE.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  const candidate = await crud.getById(id);
  return recordStage(candidate, stage, { byUserId, note });
}

// Hire a candidate: create an Employee (in onboarding) seeded from the candidate,
// mark the candidate 'hired' and link them. The employeeCode + Firebase login
// are still minted later, at onboarding approval. `dateOfJoining` is set when the
// hire comes from an accepted offer that carried an expected joining date, so the
// onboarding list can show when they start.
async function hire(id, { dateOfJoining = null, byUserId = null } = {}) {
  const candidate = await crud.getById(id);
  if (candidate.convertedEmployeeId) {
    throw new CustomError('Candidate has already been hired', 409, 'CONFLICT');
  }
  const existing = await Employee.findOne({ where: { email: candidate.email } });
  if (existing) throw new CustomError('An employee with this email already exists', 409, 'CONFLICT');

  const employee = await Employee.create({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    departmentId: candidate.departmentId,
    designationId: candidate.designationId,
    candidateId: candidate.id,
    status: 'onboarding',
    onboardingStage: 'profile',
    dateOfJoining: dateOfJoining || null,
  });
  await recordStage(candidate, 'hired', { byUserId, note: 'Converted to employee (onboarding)' });
  await candidate.update({ convertedEmployeeId: employee.id });
  return employee;
}

// List with the recruitment filters the UI needs: by role (?jobPostingId=) for
// the per-job applications view, and by ?stage=. Everything else falls through
// to the shared CRUD list (search/sort/paginate).
function list(query = {}) {
  const filters = {};
  if (query.jobPostingId) filters.jobPostingId = query.jobPostingId;
  if (query.stage) filters.stage = query.stage;
  return crud.list({ ...query, filters });
}

// The application detail: the candidate plus everything hanging off them — the
// role applied for, interview rounds, offers, and the stage history — in one
// call, so the detail page is a single round-trip.
async function getDetail(id) {
  const candidate = await Candidate.findByPk(id, {
    include: [
      { model: JobPosting },
      { model: InterviewRound, as: 'interviews' },
      { model: JobOffer, as: 'offers' },
      { model: CandidateStageEvent, as: 'stageEvents' },
    ],
    order: [
      [{ model: InterviewRound, as: 'interviews' }, 'roundNumber', 'ASC'],
      [{ model: CandidateStageEvent, as: 'stageEvents' }, 'createdAt', 'ASC'],
      [{ model: JobOffer, as: 'offers' }, 'createdAt', 'DESC'],
    ],
  });
  if (!candidate) throw new CustomError('Candidate not found', 404, 'NOT_FOUND');
  return candidate;
}

async function getHistory(id) {
  await crud.getById(id); // 404 if the candidate doesn't exist
  const data = await CandidateStageEvent.findAll({
    where: { candidateId: id }, order: [['createdAt', 'ASC']],
  });
  return { data, totalCount: data.length };
}

// ── Interview rounds ───────────────────────────────────────────────────────
const INTERVIEW_FIELDS = ['roundNumber', 'title', 'mode', 'scheduledAt',
  'interviewerName', 'interviewerUserId', 'status', 'result', 'feedback'];
const pickInterview = (body) => {
  const out = {};
  INTERVIEW_FIELDS.forEach((f) => { if (body[f] !== undefined) out[f] = body[f]; });
  return out;
};

async function listInterviews(id) {
  await crud.getById(id);
  const data = await InterviewRound.findAll({
    where: { candidateId: id }, order: [['roundNumber', 'ASC']],
  });
  return { data, totalCount: data.length };
}

// Adding a round auto-numbers it and, if the candidate is behind the interview
// stage, moves them onto it — scheduling a round IS entering the interview phase.
async function addInterview(id, body, actor = {}) {
  const candidate = await crud.getById(id);
  const count = await InterviewRound.count({ where: { candidateId: id } });
  const round = await InterviewRound.create({
    ...pickInterview(body),
    candidateId: id,
    roundNumber: body.roundNumber || count + 1,
  });
  if (['applied', 'screening', 'shortlisted'].includes(candidate.stage)) {
    await recordStage(candidate, 'interview', { byUserId: actor.byUserId, note: 'Interview scheduled' });
  }
  return round;
}

async function updateInterview(id, roundId, body) {
  const round = await InterviewRound.findOne({ where: { id: roundId, candidateId: id } });
  if (!round) throw new CustomError('Interview round not found', 404, 'NOT_FOUND');
  await round.update(pickInterview(body));
  return round;
}

async function removeInterview(id, roundId) {
  const round = await InterviewRound.findOne({ where: { id: roundId, candidateId: id } });
  if (!round) throw new CustomError('Interview round not found', 404, 'NOT_FOUND');
  await round.destroy();
  return { success: true };
}

async function listOffers(id) {
  await crud.getById(id);
  const data = await JobOffer.findAll({
    where: { candidateId: id }, order: [['createdAt', 'DESC']],
  });
  return { data, totalCount: data.length };
}

module.exports = {
  ...crud,
  STAGES,
  list,
  advanceStage,
  recordStage,
  hire,
  getDetail,
  getHistory,
  listInterviews,
  addInterview,
  updateInterview,
  removeInterview,
  listOffers,
};
