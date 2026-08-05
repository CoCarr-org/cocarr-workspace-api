const admin = require('firebase-admin');
const { CustomError } = require('./error');
const fb = require('../helper/firebaseAdmin');

// Verify the caller's Firebase (admin project) ID token and attach a minimal
// actor to req.actor for attribution. Mirrors cocarr-core-api's authenticateAdmin
// intent but kept lean here.
//
// DEV ESCAPE HATCH: if Firebase is not configured OR AUTH_DISABLED=true, a
// synthetic dev actor is attached so the service is usable locally without
// credentials. Never set AUTH_DISABLED=true in production.
async function authenticate(req, res, next) {
  try {
    if (process.env.AUTH_DISABLED === 'true' || !fb.isConfigured()) {
      req.actor = { uid: 'dev', name: 'dev', email: 'dev@local' };
      return next();
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) throw new CustomError('Missing Authorization header', 401, 'UNAUTHENTICATED');
    const decoded = await admin.auth().verifyIdToken(token);
    req.actor = { uid: decoded.uid, name: decoded.name, email: decoded.email };
    return next();
  } catch (err) {
    return next(err instanceof CustomError ? err : new CustomError('Invalid token', 401, 'UNAUTHENTICATED'));
  }
}

module.exports = { authenticate };
