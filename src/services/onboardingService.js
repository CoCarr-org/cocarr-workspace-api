const { CustomError } = require('../middlewares/error');
const { Employee } = require('../models');
const { nextEmployeeCode } = require('../utils/employeeCode');
const fb = require('../helper/firebaseAdmin');
const Logger = require('../helper/logger');

const ORDER = ['profile', 'documents', 'review', 'approved'];

async function get(employeeId) {
  const emp = await Employee.findByPk(employeeId);
  if (!emp) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    status: emp.status,
    onboardingStage: emp.onboardingStage,
    firebaseLinked: Boolean(emp.firebaseUid),
    nextStage: ORDER[ORDER.indexOf(emp.onboardingStage) + 1] || null,
  };
}

// Move onboarding forward one (or to a specific) stage. Cannot skip ahead, and
// 'approved' is reached only through approve() (which also mints the code/login).
async function advance(employeeId, toStage) {
  const emp = await Employee.findByPk(employeeId);
  if (!emp) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
  if (emp.status !== 'onboarding') throw new CustomError('Employee is not in onboarding', 409, 'CONFLICT');

  const current = ORDER.indexOf(emp.onboardingStage);
  const target = toStage ? ORDER.indexOf(toStage) : current + 1;
  if (target === -1) throw new CustomError(`stage must be one of ${ORDER.join(', ')}`, 400, 'VALIDATION_ERROR');
  if (toStage === 'approved') throw new CustomError('Use POST /onboarding/:id/approve to approve', 400, 'BAD_REQUEST');
  if (target <= current) throw new CustomError('Cannot move onboarding backwards', 400, 'BAD_REQUEST');
  if (target > current + 1) throw new CustomError('Cannot skip onboarding stages', 400, 'BAD_REQUEST');

  await emp.update({ onboardingStage: ORDER[target] });
  return get(employeeId);
}

// Approval is the pivot of the employee lifecycle (charter):
//   review -> APPROVE -> mint EMP code -> create Firebase login -> reset link
// After this the employee sets their password via the reset link and has
// workspace access. Firebase user creation is best-effort when Firebase is not
// configured (dev): the employee is still activated, flagged as not-yet-linked.
async function approve(employeeId, { dateOfJoining } = {}) {
  const emp = await Employee.findByPk(employeeId);
  if (!emp) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
  if (emp.status === 'active') throw new CustomError('Employee is already active', 409, 'CONFLICT');
  if (emp.onboardingStage !== 'review') {
    throw new CustomError('Employee must be at the "review" stage to approve', 409, 'CONFLICT');
  }

  // 1) Business identity — EMP-000001 (never the Firebase UID).
  if (!emp.employeeCode) emp.employeeCode = await nextEmployeeCode();

  // 2) Staff login in the Firebase ADMIN project, stored separately as firebaseUid.
  let resetLink = null;
  let firebaseCreated = false;
  if (fb.isConfigured()) {
    try {
      const user = await fb.createStaffUser({
        email: emp.email,
        displayName: [emp.firstName, emp.lastName].filter(Boolean).join(' '),
        phone: emp.phone,
      });
      emp.firebaseUid = user.uid;
      resetLink = await fb.generatePasswordResetLink(emp.email);
      firebaseCreated = true;
    } catch (e) {
      // A real failure here (e.g. email already a Firebase user) must not be
      // silently swallowed — surface it so the operator can resolve it.
      throw new CustomError(`Firebase staff-login creation failed: ${e.message}`, 502, 'FIREBASE_ERROR');
    }
  } else {
    Logger.warn(`[onboarding] approved ${emp.email} without a Firebase login (not configured).`);
  }

  emp.onboardingStage = 'approved';
  emp.status = 'active';
  emp.dateOfJoining = dateOfJoining || emp.dateOfJoining || new Date().toISOString().slice(0, 10);
  await emp.save();

  // resetLink is returned ONCE — there is no re-fetch endpoint. The caller must
  // hand it to the new employee (same pattern as core-api admin creation).
  return {
    employee: emp,
    employeeCode: emp.employeeCode,
    firebaseCreated,
    resetLink,
  };
}

module.exports = { get, advance, approve };
