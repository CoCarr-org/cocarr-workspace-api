const Logger = require('./logger');

// Uses Node's BUILT-IN fetch (>= 18) rather than axios, which this service does
// not depend on. One GET is not worth a new dependency in every service that
// needs to ask IAM a question.

// CLIENT FOR THE PLATFORM IAM (cocarr-authorization-service).
//
// This service does not own permissions — the charter puts every access decision
// in one place, keyed by strings like 'workspace.employees.read'. So this asks,
// rather than keeping a second copy of the rules that would drift from the first.
//
// AUTHENTICATION is the same trusted-edge contract everything else uses: the
// gateway key plus the principal. Without GATEWAY_KEY configured on both sides
// the IAM service will refuse us, which surfaces as a 503 on every gated route
// rather than as an accidental allow.
//
// THE CACHE is what makes a per-request check affordable: without it every
// gated call becomes two HTTP round-trips. The cost is that a REVOCATION takes
// up to PERMISSION_CACHE_MS to bite. 15s is short enough that "we removed their
// access" is true within a quarter of a minute and long enough to collapse a
// page's worth of parallel calls into one lookup. Set it to 0 to disable.
const BASE_URL = process.env.AUTHORIZATION_SERVICE_URL || 'http://localhost:3060';
const GATEWAY_KEY = process.env.GATEWAY_KEY || '';
const CACHE_MS = process.env.PERMISSION_CACHE_MS !== undefined
  ? parseInt(process.env.PERMISSION_CACHE_MS, 10)
  : 15000;
const TIMEOUT_MS = parseInt(process.env.AUTHORIZATION_TIMEOUT_MS || '3000', 10);
const MAX_ENTRIES = 5000;

const cache = new Map();

function remember(principalId, value) {
  if (!CACHE_MS) return;
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(principalId, { value, expiresAt: Date.now() + CACHE_MS });
}

// Throws on any failure. That is deliberate and is the whole contract: the
// caller must not be able to mistake "the check broke" for "the check passed".
async function effective(principalId) {
  const hit = cache.get(principalId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const res = await fetch(
    `${BASE_URL}/v1/principals/${encodeURIComponent(principalId)}/permissions`,
    {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        ...(GATEWAY_KEY ? { 'x-gateway-key': GATEWAY_KEY } : {}),
        'x-user-id': principalId,
      },
    },
  );
  // fetch does NOT throw on 4xx/5xx the way axios does. Without this the caller
  // would parse an error body into an empty permission list and read it as
  // "authenticated, holds nothing" — a silent, total denial that looks like a
  // permissions bug rather than the outage it is.
  if (!res.ok) throw new Error(`IAM responded ${res.status}`);
  const body = await res.json();
  const value = {
    superAdmin: Boolean(body?.superAdmin),
    permissions: Array.isArray(body?.permissions) ? body.permissions : [],
  };
  remember(principalId, value);
  return value;
}

// Call after any change this service makes that alters someone's access, so the
// change is visible immediately rather than at the end of the cache window.
function forget(principalId) {
  if (principalId) cache.delete(principalId);
  else cache.clear();
}

function isConfigured() {
  return Boolean(BASE_URL);
}

Logger.info(`[iam] authorization service: ${BASE_URL} (cache ${CACHE_MS}ms)`);

module.exports = { effective, forget, isConfigured };
