const { CustomError } = require('../middlewares/error');
const { AccessRequest, Employee } = require('../models');

async function create(employeeId, { target, reason }) {
  const emp = await Employee.findByPk(employeeId);
  if (!emp) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
  if (!target || typeof target !== 'object') {
    throw new CustomError('target (the requested access scope) is required', 400, 'VALIDATION_ERROR');
  }
  return AccessRequest.create({ employeeId, target, reason: reason || null });
}

async function list({ status, employeeId } = {}) {
  const where = {};
  if (status) where.status = status;
  if (employeeId) where.employeeId = employeeId;
  const data = await AccessRequest.findAll({ where, order: [['createdAt', 'DESC']] });
  return { data, totalCount: data.length };
}

async function getById(id) {
  const row = await AccessRequest.findByPk(id);
  if (!row) throw new CustomError('Access request not found', 404, 'NOT_FOUND');
  return row;
}

// Record an approval/rejection decision. NOTE: this records the workflow outcome
// only. Actually granting the permission is an IAM change owned by the
// authorization service / core-api — hence iamApplied stays false until that
// integration is wired. Callers should not treat an approved request as
// effective access on its own.
async function decide(id, { status, note, actorUid }) {
  if (!['approved', 'rejected'].includes(status)) {
    throw new CustomError('status must be "approved" or "rejected"', 400, 'VALIDATION_ERROR');
  }
  const row = await getById(id);
  if (row.status !== 'pending') throw new CustomError('Request has already been decided', 409, 'CONFLICT');
  await row.update({
    status,
    decisionNote: note || null,
    decidedByUid: actorUid || null,
    decidedAt: new Date(),
  });
  return row;
}

module.exports = { create, list, getById, decide };
