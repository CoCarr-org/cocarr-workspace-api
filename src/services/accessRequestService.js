const { CustomError } = require('../middlewares/error');
const { AccessRequest, Employee } = require('../models');
const iam = require('../helper/authorizationClient');
const Logger = require('../helper/logger');

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

// Turn an approved request into an actual IAM grant.
//
// `target` names what was asked for; a grant needs a ROLE, so it must carry
// `roleId` or `roleKey`. A request that names neither cannot be applied — it is
// recorded honestly as approved-but-not-applied rather than pretending.
//
// The principal is the employee's Firebase uid, which is what the gateway sends
// as `x-user-id` and what IAM resolves against when no identity row exists yet.
// An employee with no staff login has no principal, so there is nothing to grant
// access to — that is a real precondition, not an error to paper over.
async function applyToIam(row, actorUid) {
  const target = row.target || {};
  const employee = await Employee.findByPk(row.employeeId);
  if (!employee) throw new CustomError('Employee not found', 404, 'NOT_FOUND');

  const principalId = employee.firebaseUid;
  if (!principalId) {
    throw new CustomError(
      'This employee has no staff login yet, so there is no principal to grant access to. '
      + 'Complete their onboarding first.',
      409, 'NO_PRINCIPAL',
    );
  }

  let roleId = target.roleId || null;
  if (!roleId && target.roleKey) {
    const roles = await iam.listRoles();
    const match = (roles?.data || roles || []).find((r) => r.key === target.roleKey);
    if (!match) throw new CustomError(`No IAM role with key "${target.roleKey}"`, 400, 'UNKNOWN_ROLE');
    roleId = match.id;
  }
  if (!roleId) {
    throw new CustomError(
      'The request target names no roleId or roleKey, so there is nothing to grant. '
      + 'Access is granted by assigning a role.',
      400, 'NO_ROLE_IN_TARGET',
    );
  }

  await iam.assignRole({
    principalId,
    roleId,
    reason: `Access request ${row.id}`,
  }, actorUid);

  // The employee's permissions just changed; drop the cached copy so the change
  // is visible on their next call rather than up to PERMISSION_CACHE_MS later.
  iam.forget(principalId);

  await row.update({ iamApplied: true });
  return row;
}

// Record an approval/rejection decision, and on approval actually apply it.
//
// THE DECISION AND THE GRANT ARE SEPARATE, deliberately. A human decided; that
// is a fact and it is recorded whatever happens next. If the IAM write then
// fails, the decision stands and `iamApplied` stays false, with the reason
// returned — because the one thing that must never happen is a request that
// reads as approved-and-applied while nobody actually got access.
//
// `POST /access-requests/:id/apply` retries the grant without asking anyone to
// decide again.
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

  if (status !== 'approved') return { request: row, iamApplied: false, iamError: null };

  try {
    await applyToIam(row, actorUid);
    return { request: row, iamApplied: true, iamError: null };
  } catch (e) {
    Logger.error(`[accessRequest] ${row.id} approved but NOT applied: ${e.message}`);
    return { request: row, iamApplied: false, iamError: e.message };
  }
}

// Retry the grant for a request that was approved but never applied.
async function apply(id, actorUid) {
  const row = await getById(id);
  if (row.status !== 'approved') {
    throw new CustomError('Only an approved request can be applied', 409, 'CONFLICT');
  }
  if (row.iamApplied) return { request: row, iamApplied: true, iamError: null };
  await applyToIam(row, actorUid);
  return { request: row, iamApplied: true, iamError: null };
}

module.exports = {
  create, list, getById, decide, apply,
};
