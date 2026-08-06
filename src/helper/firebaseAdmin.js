const admin = require('firebase-admin');
const Logger = require('./logger');

// Firebase Admin for the ADMIN/staff project — the same project cocarr-core-api
// uses for panel staff (ADMIN_SERVICE_ACCOUNT). Workspace creates a staff login
// for an employee at the end of onboarding.
//
// Deliberately LAZY and OPTIONAL: the service must boot for local development
// without credentials. `isConfigured()` tells callers whether real user
// creation is possible; when it is not, onboarding still completes but records
// that no Firebase user was created (rather than crashing the whole flow).
let app = null;
let configured = false;

// ADMIN_SERVICE_ACCOUNT is BASE64-ENCODED JSON across this platform. A service
// account carries a PEM private key full of newlines, and env vars holding
// literal newlines get mangled by hosts, shells and dashboards, so base64 is
// what makes the value survive — and it is what is set on Railway today.
//
// Only JSON and a file path were handled, so a base64 value fell through to
// require() and failed as a missing module, taking auth down service-wide.
// Order: JSON, then base64 (accepted only when it decodes to something starting
// with '{', so a real path is never mistaken for it), then the path form.
function parseServiceAccount() {
  const raw = process.env.ADMIN_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const value = raw.trim();
    if (value.startsWith('{')) return JSON.parse(value);

    const decoded = Buffer.from(value, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) return JSON.parse(decoded);

    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(require('path').resolve(value));
  } catch (e) {
    // Deliberately WITHOUT e.message: require() puts the resolved path in its
    // error, and when the value is a service account that path IS the
    // credential — which is how a private key reached the deploy logs.
    Logger.error('ADMIN_SERVICE_ACCOUNT could not be parsed as JSON, base64 JSON, or a readable path.');
    return null;
  }
}

function init() {
  if (app) return app;
  const sa = parseServiceAccount();
  if (!sa) {
    Logger.warn('[firebase] ADMIN_SERVICE_ACCOUNT not set — staff-login creation is disabled.');
    return null;
  }
  app = admin.initializeApp({ credential: admin.credential.cert(sa) }, 'workspace-admin');
  configured = true;
  Logger.info('[firebase] Admin app initialised for workspace staff logins.');
  return app;
}

init();

const isConfigured = () => configured;

async function createStaffUser({ email, displayName, phone }) {
  if (!configured) throw new Error('Firebase admin not configured');
  const user = await admin.auth(app).createUser({
    email,
    displayName,
    ...(phone ? { phoneNumber: phone } : {}),
    emailVerified: false,
  });
  return user;
}

async function generatePasswordResetLink(email) {
  if (!configured) throw new Error('Firebase admin not configured');
  return admin.auth(app).generatePasswordResetLink(email);
}

async function deleteStaffUser(uid) {
  if (!configured || !uid) return;
  await admin.auth(app).deleteUser(uid);
}

// MUST go through `app`. This service initialises a NAMED app
// ('workspace-admin'), so `admin.auth()` resolves the DEFAULT app, which does
// not exist here and throws "The default Firebase app does not exist". The auth
// middleware called it that way and therefore rejected every bearer token with
// a 401 the moment credentials were actually configured — invisible until now
// only because the unconfigured branch bypassed authentication entirely.
async function verifyIdToken(token) {
  if (!configured) throw new Error('Firebase admin not configured');
  return admin.auth(app).verifyIdToken(token);
}

module.exports = {
  isConfigured, createStaffUser, generatePasswordResetLink, deleteStaffUser, verifyIdToken,
};
