const crypto = require('crypto');
const { CustomError } = require('./error');
const fb = require('../helper/firebaseAdmin');
const Logger = require('../helper/logger');

// AUTHENTICATION — three modes, tried in this order, and NONE of them fail open.
//
// 1. TRUSTED EDGE. The request carries `x-gateway-key` matching ours, so it
//    reached us through cocarr-api-gateway, which already verified the Firebase
//    token. We take `x-user-id` / `x-identity-id` from the headers instead of
//    verifying a second time — one token, one verification, per request. The
//    gateway STRIPS client-supplied copies of those headers at the edge, so a
//    value arriving here behind a valid key can only have been minted there.
//
// 2. DEV BYPASS. `AUTH_DISABLED=true` AND `NODE_ENV !== 'production'`. Both
//    conditions, always — a stray AUTH_DISABLED promoted to production is
//    ignored and logged, never honoured.
//
// 3. DIRECT BEARER TOKEN. No gateway hop (the web app still calls services
//    directly today), so we verify the Firebase ID token ourselves.
//
// WHAT CHANGED, AND WHY IT MATTERED: this used to begin
//
//     if (AUTH_DISABLED === 'true' || !fb.isConfigured()) { req.actor = {uid:'dev'}; next() }
//
// The second half is the dangerous one, because it is not a decision anybody
// makes: a missing or malformed ADMIN_SERVICE_ACCOUNT in production silently
// turned this service into an open API, every request arriving as a synthetic
// dev actor with no error anywhere. Unconfigured credentials now answer 503 on
// every authenticated route — the service still boots and /v1/health still
// reports, so the misconfiguration stays diagnosable, but nothing gets through
// unauthenticated.
//
// A MISMATCHED gateway key is a hard deny, never a fall-through to token
// verification — the same rule as cocarr-core-api's panel keys, for the same
// reason: if a wrong key merely demoted you to the next check, sending a key
// would be strictly better than not sending one.

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const GATEWAY_KEY = process.env.GATEWAY_KEY || '';
const DEV_BYPASS = process.env.AUTH_DISABLED === 'true' && !IS_PRODUCTION;

if (process.env.AUTH_DISABLED === 'true' && IS_PRODUCTION) {
  Logger.error('[auth] AUTH_DISABLED=true IGNORED — it is a development switch and never applies in production.');
}
if (IS_PRODUCTION && !GATEWAY_KEY && !fb.isConfigured()) {
  Logger.error(
    '[auth] FATAL: neither GATEWAY_KEY nor ADMIN_SERVICE_ACCOUNT is configured — '
    + 'every authenticated route will answer 503. Set one.',
  );
}

// Constant-time, so the key cannot be recovered a byte at a time from response
// timings. Length is checked first because timingSafeEqual throws on buffers of
// differing length.
function gatewayKeyMatches(presented) {
  const a = Buffer.from(String(presented));
  const b = Buffer.from(GATEWAY_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function authenticate(req, res, next) {
  try {
    // 1 — trusted edge. Only consulted when WE hold a key; without one the
    // header carries no meaning and is ignored rather than becoming a way to 401.
    const presentedKey = req.headers['x-gateway-key'];
    if (GATEWAY_KEY && presentedKey) {
      if (!gatewayKeyMatches(presentedKey)) {
        throw new CustomError('Invalid gateway key', 401, 'UNAUTHENTICATED');
      }
      const uid = req.headers['x-user-id'];
      if (!uid) throw new CustomError('Gateway supplied no authenticated user', 401, 'UNAUTHENTICATED');
      req.actor = {
        uid,
        name: req.headers['x-user-name'] || null,
        email: req.headers['x-user-email'] || null,
        // The platform identity id is the stable cross-service key. Optional: a
        // caller authenticated before POST /v1/auth/verify created its identity
        // row travels without one.
        identityId: req.headers['x-identity-id'] || null,
        via: 'gateway',
      };
      return next();
    }

    // 2 — dev bypass (impossible in production; see DEV_BYPASS).
    if (DEV_BYPASS) {
      req.actor = { uid: 'dev', name: 'dev', email: 'dev@local', identityId: null, via: 'dev-bypass' };
      return next();
    }

    // 3 — direct bearer token.
    if (!fb.isConfigured()) {
      throw new CustomError('Authentication is not configured on this service', 503, 'AUTH_UNAVAILABLE');
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
    if (!token) throw new CustomError('Missing Authorization header', 401, 'UNAUTHENTICATED');

    // Via the helper, NOT admin.auth() — this service initialises a named app.
    const decoded = await fb.verifyIdToken(token);
    req.actor = {
      uid: decoded.uid,
      name: decoded.name || null,
      email: decoded.email || null,
      identityId: null,
      via: 'token',
    };
    return next();
  } catch (err) {
    return next(err instanceof CustomError ? err : new CustomError('Invalid token', 401, 'UNAUTHENTICATED'));
  }
}

module.exports = { authenticate };
