const { createCrudService } = require('./crudFactory');
const { CustomError } = require('../middlewares/error');
const { Candidate, Employee } = require('../models');

const crud = createCrudService({
  model: Candidate,
  entityType: 'Candidate',
  searchable: ['firstName', 'lastName', 'email', 'positionTitle'],
  allowed: ['firstName', 'lastName', 'email', 'phone', 'positionTitle',
    'departmentId', 'designationId', 'source', 'resumeKey', 'notes'],
});

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];

async function advanceStage(id, stage) {
  if (!STAGES.includes(stage)) throw new CustomError(`stage must be one of ${STAGES.join(', ')}`, 400, 'VALIDATION_ERROR');
  const candidate = await crud.getById(id);
  await candidate.update({ stage });
  return candidate;
}

// Hire a candidate: create an Employee (in onboarding) seeded from the candidate,
// mark the candidate 'hired' and link them. The employeeCode + Firebase login
// are still minted later, at onboarding approval.
async function hire(id) {
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
  });
  await candidate.update({ stage: 'hired', convertedEmployeeId: employee.id });
  return employee;
}

module.exports = { ...crud, advanceStage, hire };
