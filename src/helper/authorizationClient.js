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

// ── approval requests ────────────────────────────────────────────────────────
//
// IAM owns the workflow; this service owns the thing being approved. These are
// the two questions and one command that boundary needs.
//
// NOT cached, unlike `effective`. A permission answer that is 15s stale merely
// delays a revocation; an approval answer that is 15s stale could let the
// irreversible step run against a request that was just rejected.
// A SERVICE-TO-SERVICE CALL STILL NEEDS A PRINCIPAL.
//
// IAM's trusted-edge mode treats `x-gateway-key` as proof the request came
// through the gateway, and then REQUIRES `x-user-id` — a valid key with no user
// is refused with "Gateway supplied no authenticated user", which is correct: the
// key says where the request came from, not who is making it.
//
// Calls made by this service on nobody's behalf (resolving the baseline role
// during a migration, for instance) therefore travel as an explicit system
// actor rather than anonymously. Named so it is recognisable in an audit trail
// as the service acting, not a person.
const SYSTEM_PRINCIPAL = 'system:cocarr-workspace-api';

async function iamFetch(path, { method = 'GET', body, principalId } = {}) {
  const res = await fetch(`${BASE_URL}/v1${path}`, {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      ...(GATEWAY_KEY ? { 'x-gateway-key': GATEWAY_KEY } : {}),
      'x-user-id': principalId || SYSTEM_PRINCIPAL,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(parsed?.error?.message || `IAM responded ${res.status}`);
    err.status = res.status;
    err.errorCode = parsed?.error?.code || null;
    throw err;
  }
  return parsed;
}

const openApprovalRequest = (payload, principalId) => iamFetch('/approval-requests', {
  method: 'POST', body: payload, principalId,
});

const approvalStatusFor = (subjectType, subjectId, requestType) => iamFetch(
  `/approval-requests/subject/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`
  + (requestType ? `?requestType=${encodeURIComponent(requestType)}` : ''),
);

const assignRole = (payload, principalId) => iamFetch('/assignments', {
  method: 'POST', body: payload, principalId,
});

const listRoles = () => iamFetch('/roles?limit=200');

Logger.info(`[iam] authorization service: ${BASE_URL} (cache ${CACHE_MS}ms)`);

module.exports = {
  effective, forget, isConfigured,
  openApprovalRequest, approvalStatusFor, assignRole, listRoles,
};
