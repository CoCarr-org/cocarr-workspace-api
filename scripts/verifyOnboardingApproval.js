/**
 * Proves the approval GATE on onboarding: that the irreversible step refuses
 * without an approved IAM request, and refuses when IAM cannot be reached.
 *
 *   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASS= DB_NAME=ws_test \
 *     node scripts/verifyOnboardingApproval.js
 *
 * IAM is stubbed here on purpose — the thing under test is THIS service's
 * reaction to each answer IAM can give, and stubbing is the only way to
 * reproduce "IAM is down" on demand. The engine itself is tested for real in
 * cocarr-authorization-service/scripts/verifyApprovalRequests.js.
 */
const path = require('path');

// Stub the IAM client before anything requires it.
const iamPath = require.resolve('../src/helper/authorizationClient');
const iamStub = {
  answer: { status: 'none', requestId: null },
  throwOnStatus: null,
  opened: [],
  effective: async () => ({ superAdmin: true, permissions: [] }),
  forget: () => {},
  isConfigured: () => true,
  approvalStatusFor: async () => {
    if (iamStub.throwOnStatus) throw new Error(iamStub.throwOnStatus);
    return iamStub.answer;
  },
  openApprovalRequest: async (payload) => {
    iamStub.opened.push(payload);
    return { id: 'req-1', status: 'pending', ...payload };
  },
  assignRole: async () => ({ id: 'a1' }),
  listRoles: async () => ({ data: [{ id: 'role-1', key: 'ops-agent' }] }),
};
require.cache[iamPath] = { id: iamPath, filename: iamPath, loaded: true, exports: iamStub };

const { db, Employee } = require('../src/models');
const svc = require('../src/services/onboardingService');

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};
const expectThrow = async (label, fn, needle) => {
  try { await fn(); check(label, false, 'did not throw'); } catch (e) {
    const msg = `${e.errorCode || ''} ${e.message || ''}`;
    check(label, !needle || msg.includes(needle), msg.trim());
  }
};

const EMAIL = 'approval-gate-test@example.invalid';

(async () => {
  await db.sync();
  await Employee.destroy({ where: { email: EMAIL } });

  const mk = async (stage) => {
    await Employee.destroy({ where: { email: EMAIL } });
    return Employee.create({
      firstName: 'Gate', lastName: 'Test', email: EMAIL,
      status: 'onboarding', onboardingStage: stage,
    });
  };

  // ── submit ───────────────────────────────────────────────────────────────
  let emp = await mk('profile');
  await expectThrow('cannot submit before reaching review',
    () => svc.submit(emp.id, 'p-hr'), 'CONFLICT');

  emp = await mk('review');
  iamStub.opened = [];
  const submitted = await svc.submit(emp.id, 'p-hr');
  check('submitting at review opens an IAM request', iamStub.opened.length === 1);
  check('it carries the right requestType and subject',
    iamStub.opened[0].requestType === 'workspace.onboarding.approval'
    && iamStub.opened[0].subjectType === 'employee'
    && iamStub.opened[0].subjectId === emp.id,
    JSON.stringify(iamStub.opened[0]?.requestType));
  check('submit does not itself activate the employee',
    submitted.status === 'onboarding' && submitted.onboardingStage === 'review');

  // ── THE GATE ─────────────────────────────────────────────────────────────
  iamStub.answer = { status: 'none' };
  await expectThrow('approve REFUSES when nothing was submitted',
    () => svc.approve(emp.id), 'NOT_APPROVED');

  iamStub.answer = { status: 'pending' };
  await expectThrow('approve REFUSES while the request is still pending',
    () => svc.approve(emp.id), 'still waiting for approval');

  iamStub.answer = { status: 'rejected' };
  await expectThrow('approve REFUSES on a rejected request',
    () => svc.approve(emp.id), 'was rejected');

  // The one that matters most: a broken check must not be a pass.
  iamStub.answer = { status: 'approved' };
  iamStub.throwOnStatus = 'ECONNREFUSED';
  await expectThrow('approve REFUSES when IAM is unreachable (never fails open)',
    () => svc.approve(emp.id), 'APPROVAL_UNAVAILABLE');
  iamStub.throwOnStatus = null;

  let after = await Employee.findByPk(emp.id);
  check('after every refusal NOTHING was minted',
    !after.employeeCode && after.status === 'onboarding' && after.onboardingStage === 'review',
    `code=${after.employeeCode} status=${after.status}`);

  // ── the happy path ───────────────────────────────────────────────────────
  iamStub.answer = { status: 'approved', requestId: 'req-1' };
  const result = await svc.approve(emp.id);
  check('an APPROVED request lets the side effect run', Boolean(result.employeeCode), result.employeeCode);
  after = await Employee.findByPk(emp.id);
  check('the employee is activated and stamped', after.status === 'active' && after.onboardingStage === 'approved'
    && Boolean(after.dateOfJoining), `${after.status}/${after.onboardingStage}`);
  check('no Firebase configured ⇒ no login, and it says so',
    result.firebaseCreated === false && result.resetLink === null);

  await expectThrow('approving twice is refused', () => svc.approve(emp.id), 'already active');

  // ── reporting ────────────────────────────────────────────────────────────
  const state = await svc.get(emp.id);
  check('get() reports the IAM approval state', state.approval.status === 'approved', state.approval.status);
  check('and offers neither submit nor approve once done',
    state.canSubmit === false && state.canApprove === false);

  iamStub.throwOnStatus = 'boom';
  const degraded = await svc.get(emp.id);
  check('get() degrades to "unknown" rather than failing when IAM is down',
    degraded.approval.status === 'unknown', degraded.approval.status);
  iamStub.throwOnStatus = null;

  await Employee.destroy({ where: { email: EMAIL } });
  await db.close();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
