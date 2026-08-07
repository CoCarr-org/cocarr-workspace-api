const { CustomError } = require('../middlewares/error');
const { Employee } = require('../models');
const { nextEmployeeCode } = require('../utils/employeeCode');
const fb = require('../helper/firebaseAdmin');
const Logger = require('../helper/logger');
const iam = require('../helper/authorizationClient');

const ORDER = ['profile', 'documents', 'review', 'approved'];

// The approval this lifecycle waits on. IAM seeds the matching chain
// (workspace.onboarding.default); a missing chain refuses the submission rather
// than letting it through, so this cannot silently degrade to no approval.
const REQUEST_TYPE = 'workspace.onboarding.approval';
const SUBJECT_TYPE = 'employee';

async function get(employeeId) {
  const emp = await Employee.findByPk(employeeId);
  if (!emp) throw new CustomError('Employee not found', 404, 'NOT_FOUND');

  // The approval state belongs to IAM, so it is read rather than mirrored here.
  // A copy in this table would be a second source of truth for "may this be
  // approved", and the two would drift the first time a request was cancelled.
  let approval = { status: 'none', requestId: null };
  try {
    const res = await iam.approvalStatusFor(SUBJECT_TYPE, employeeId, REQUEST_TYPE);
    approval = { status: res?.status || 'none', requestId: res?.requestId || null };
  } catch (e) {
    // Reporting is not gating — a read that fails must not make the screen
    // unusable. `approve` does its own check and refuses on error.
    approval = { status: 'unknown', requestId: null, error: e.message };
  }

  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    status: emp.status,
    onboardingStage: emp.onboardingStage,
    firebaseLinked: Boolean(emp.firebaseUid),
    nextStage: ORDER[ORDER.indexOf(emp.onboardingStage) + 1] || null,
    approval,
    // What the UI should offer, decided here so the client never re-derives it.
    canSubmit: emp.status === 'onboarding' && emp.onboardingStage === 'review'
      && !['pending', 'approved'].includes(approval.status),
    canApprove: emp.status === 'onboarding' && emp.onboardingStage === 'review'
      && approval.status === 'approved',
  };
}

// HR submits a finished record for approval. This is the seam between "HR is
// still working on it" and "somebody must sign it off".
async function submit(employeeId, principalId) {
  const emp = await Employee.findByPk(employeeId);
  if (!emp) throw new CustomError('Employee not found', 404, 'NOT_FOUND');
  if (emp.status !== 'onboarding') throw new CustomError('Employee is not in onboarding', 409, 'CONFLICT');
  if (emp.onboardingStage !== 'review') {
    throw new CustomError('Employee must be at the "review" stage to submit for approval', 409, 'CONFLICT');
  }

  try {
    const request = await iam.openApprovalRequest({
      requestType: REQUEST_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: emp.id,
      summary: `Onboarding approval — ${[emp.firstName, emp.lastName].filter(Boolean).join(' ')}`,
      metadata: { email: emp.email, employeeId: emp.id },
    }, principalId);
    return { ...(await get(employeeId)), request };
  } catch (e) {
    // Surface IAM's own message: it distinguishes "already in flight" from "no
    // chain configured", and those need different actions from the person.
    throw new CustomError(
      `Could not open the approval request: ${e.message}`,
      e.status === 409 ? 409 : 502,
      e.errorCode || 'APPROVAL_UNAVAILABLE',
    );
  }
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

  // THE APPROVAL GATE. Everything below this line is irreversible — an employee
  // code is allocated from a counter and a Firebase user is created — so it runs
  // only against a request IAM says was approved by whoever the chain names.
  //
  // A FAILED CHECK IS A REFUSAL, never a pass. "IAM is unreachable" is not a
  // reason to mint a staff login; it is the same rule permissionMiddleware
  // already applies to every gated route in this service.
  let approval;
  try {
    approval = await iam.approvalStatusFor(SUBJECT_TYPE, emp.id, REQUEST_TYPE);
  } catch (e) {
    throw new CustomError(
      `Could not confirm approval with IAM, so nothing was created: ${e.message}`,
      503, 'APPROVAL_UNAVAILABLE',
    );
  }
  if (approval?.status !== 'approved') {
    throw new CustomError(
      approval?.status === 'pending'
        ? 'This onboarding is still waiting for approval'
        : approval?.status === 'rejected'
          ? 'This onboarding was rejected — fix what was flagged and submit it again'
          : 'Submit this onboarding for approval before approving it',
      409, 'NOT_APPROVED',
    );
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

module.exports = { get, advance, submit, approve };
