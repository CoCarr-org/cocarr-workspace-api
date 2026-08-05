const { CustomError } = require('./error');
const iam = require('../helper/authorizationClient');
const Logger = require('../helper/logger');

// GATE A ROUTE ON A PLATFORM PERMISSION.
//
//   router.get('/', authenticate, requirePermission('employees', 'read'), ctrl.list)
//
// Must run AFTER `authenticate`, which is what sets `req.actor`.
//
// The permission key is built as `workspace.<module>.<action>` — the same string
// the IAM taxonomy seeds and the same one the navigation payload hands the UI.
// One vocabulary end to end: what the sidebar renders from is what the server
// checks, so the two cannot disagree about what somebody may do.
//
// ── ENFORCEMENT IS ON BY DEFAULT ──
// `RBAC_ENFORCE=false` falls back to dry-run (denials logged, requests allowed)
// so a lockout can be debugged without redeploying. This mirrors cocarr-core-api
// exactly, deliberately: two services in one platform disagreeing about what
// their enforcement flag means is how somebody turns off more than they meant to.
//
// ── A BROKEN CHECK IS A DENIAL, NOT A PASS ──
// If the IAM service is unreachable, slow, or refuses us, the answer is 503 —
// never "allow". "The check broke" is not a reason to perform an unchecked
// write; core-api closed this exact fail-open path and this service starts closed.
const ENFORCE = process.env.RBAC_ENFORCE !== 'false';

if (!ENFORCE) {
  Logger.warn('[rbac] RBAC_ENFORCE=false — permission denials will be LOGGED ONLY, every request is allowed.');
}

// The platform identity id is the principal IAM knows. The Firebase uid is the
// fallback for a caller that reached us without passing the gateway (which is
// how the web app still talks to services today) — assignments are keyed by a
// free-string principalId, so both resolve, but the identity id is the stable one.
function principalOf(req) {
  return req.actor?.identityId || req.actor?.uid || null;
}

function requirePermission(module, action) {
  const permission = `workspace.${module}.${action}`;

  return async (req, res, next) => {
    const principalId = principalOf(req);
    try {
      if (!principalId) throw new CustomError('No authenticated principal', 401, 'UNAUTHENTICATED');

      // The dev-bypass actor is not a real principal and has no assignments.
      // Treating it as one would mean every local request 403s the moment IAM
      // is reachable, which would make people set RBAC_ENFORCE=false and leave
      // it that way — a far worse outcome than an explicit, narrow exemption.
      if (req.actor.via === 'dev-bypass') return next();

      const eff = await iam.effective(principalId);
      if (eff.superAdmin || eff.permissions.includes(permission)) return next();

      Logger.warn(`[rbac] DENIED ${principalId} -> ${permission} (${req.method} ${req.originalUrl})`);
      if (!ENFORCE) return next();
      return next(new CustomError(`You do not have permission: ${permission}`, 403, 'FORBIDDEN'));
    } catch (err) {
      if (err instanceof CustomError) return next(err);
      // Unreachable / refusing IAM. Logged loudly because it is an outage, not
      // a user error, and it will present to them as a broken page.
      Logger.error(`[rbac] permission lookup FAILED for ${principalId} -> ${permission}: ${err.message}`);
      if (!ENFORCE) return next();
      return next(new CustomError(
        'Permission check is unavailable, please retry',
        503,
        'AUTHORIZATION_UNAVAILABLE',
      ));
    }
  };
}

module.exports = { requirePermission };
