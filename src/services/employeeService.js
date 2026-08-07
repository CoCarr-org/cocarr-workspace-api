const { Op } = require('sequelize');
const { CustomError } = require('../middlewares/error');
const {
  Employee, Department, Designation, Team, EmployeeDocument,
} = require('../models');

const WRITEABLE = ['firstName', 'lastName', 'email', 'phone', 'departmentId',
  'designationId', 'teamId', 'managerId', 'dateOfJoining'];

const withRelations = {
  include: [
    { model: Department },
    { model: Designation },
    { model: Team },
    { model: Employee, as: 'manager', attributes: ['id', 'employeeCode', 'firstName', 'lastName'] },
  ],
};

async function list({ search, status, departmentId, offset = 0, limit = 25 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;
  if (search) {
    where[Op.or] = ['firstName', 'lastName', 'email', 'employeeCode']
      .map((c) => ({ [c]: { [Op.like]: `%${search}%` } }));
  }
  const data = await Employee.findAll({
    where, ...withRelations, order: [['createdAt', 'DESC']],
    offset: parseInt(offset, 10) || 0, limit: parseInt(limit, 10) || 25,
  });
  const totalCount = await Employee.count({ where });
  return { data, totalCount };
}

async function getById(id) {
  const row = await Employee.findByPk(id, {
    include: [...withRelations.include, { model: EmployeeDocument }],
  });
  if (!row) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
  return row;
}

const pick = (body) => {
  const out = {};
  WRITEABLE.forEach((f) => { if (body[f] !== undefined) out[f] = body[f]; });
  return out;
};

// Create an employee directly (e.g. an existing hire), in the onboarding state.
// The employeeCode + Firebase login are minted later, at onboarding approval.
async function create(body) {
  if (!body.firstName || !body.email) {
    throw new CustomError('firstName and email are required', 400, 'VALIDATION_ERROR');
  }
  return Employee.create({ ...pick(body), status: 'onboarding', onboardingStage: 'profile' });
}

// THE PLATFORM OWNER'S EMPLOYEE RECORD IS NOT EDITABLE HERE.
//
// They hold super-admin unconditionally in IAM and it is restored on their next
// request, so suspending or terminating this row would take away nothing while
// looking like it had — and editing their email would point the record at an
// account that is not the owner, quietly detaching the guard from the person.
//
// Enforced in the service rather than only hidden in the UI, because a control
// that exists only in a screen is not a control. `isOwner` is also returned on
// reads so a client can hide the actions instead of offering ones that 409.
const OWNER_EMAIL = String(process.env.BOOTSTRAP_OWNER_EMAIL || 'cocarrluxury23@gmail.com')
  .trim().toLowerCase();

const isOwnerRow = (row) => Boolean(row?.email)
  && String(row.email).trim().toLowerCase() === OWNER_EMAIL;

function assertNotOwner(row, verb) {
  if (isOwnerRow(row)) {
    throw new CustomError(
      `${OWNER_EMAIL} is the platform owner and cannot be ${verb}. `
      + 'They hold every permission unconditionally; change BOOTSTRAP_OWNER_EMAIL to move ownership.',
      409, 'OWNER_PROTECTED',
    );
  }
}

async function update(id, body) {
  const row = await getById(id);
  assertNotOwner(row, 'edited');
  await row.update(pick(body));
  return row;
}

// Employment-state transitions kept explicit (not a generic update) because
// they are meaningful actions, not field edits.
async function setStatus(id, status) {
  const valid = ['active', 'suspended', 'terminated'];
  if (!valid.includes(status)) throw new CustomError(`status must be one of ${valid.join(', ')}`, 400, 'VALIDATION_ERROR');
  const row = await getById(id);
  assertNotOwner(row, 'suspended or terminated');
  await row.update({ status });
  return row;
}

async function remove(id) {
  const row = await getById(id);
  assertNotOwner(row, 'deleted');
  await row.destroy();
  return { success: true };
}

async function directReports(id) {
  await getById(id);
  return Employee.findAll({
    where: { managerId: id },
    attributes: ['id', 'employeeCode', 'firstName', 'lastName', 'email', 'designationId', 'status'],
    order: [['firstName', 'ASC']],
  });
}

// Build the reporting tree from a root employee (or every top-level employee if
// no root is given). Done in-memory from a single fetch to avoid N+1 queries.
async function orgTree(rootId = null) {
  const all = await Employee.findAll({
    attributes: ['id', 'employeeCode', 'firstName', 'lastName', 'designationId', 'managerId', 'status'],
    raw: true,
  });
  const byManager = {};
  all.forEach((e) => {
    const key = e.managerId || 'root';
    (byManager[key] = byManager[key] || []).push(e);
  });
  const build = (node) => ({ ...node, reports: (byManager[node.id] || []).map(build) });
  if (rootId) {
    const root = all.find((e) => e.id === rootId);
    if (!root) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
    return build(root);
  }
  return (byManager.root || []).map(build);
}

// --- documents ------------------------------------------------------------ #
async function addDocument(employeeId, body) {
  await getById(employeeId);
  return EmployeeDocument.create({
    employeeId,
    type: body.type || 'other',
    fileKey: body.fileKey || null,
    fileName: body.fileName || null,
    note: body.note || null,
  });
}

async function listDocuments(employeeId) {
  await getById(employeeId);
  return EmployeeDocument.findAll({ where: { employeeId }, order: [['createdAt', 'DESC']] });
}

async function setDocumentStatus(employeeId, documentId, status, note) {
  const valid = ['pending', 'verified', 'rejected'];
  if (!valid.includes(status)) throw new CustomError(`status must be one of ${valid.join(', ')}`, 400, 'VALIDATION_ERROR');
  const doc = await EmployeeDocument.findOne({ where: { id: documentId, employeeId } });
  if (!doc) throw new CustomError('Document not found', 404, 'NOT_FOUND');
  await doc.update({ status, note: note || doc.note });
  return doc;
}

module.exports = {
  list, getById, create, update, setStatus, remove, directReports, orgTree,
  isOwnerRow, OWNER_EMAIL,
  addDocument, listDocuments, setDocumentStatus,
};
