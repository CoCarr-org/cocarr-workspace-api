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

function parseServiceAccount() {
  const raw = process.env.ADMIN_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept either a JSON string or a path to a JSON file.
    if (raw.trim().startsWith('{')) return JSON.parse(raw);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(require('path').resolve(raw));
  } catch (e) {
    Logger.error(`ADMIN_SERVICE_ACCOUNT could not be parsed: ${e.message}`);
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
