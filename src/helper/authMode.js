const fb = require('./firebaseAdmin');

// How this service can authenticate a caller RIGHT NOW, reported by /v1/health.
//
// `unconfigured` means every authenticated route answers 503 — the fail-closed
// outcome of having neither credentials nor a gateway key. It is deliberately
// NOT folded into health's status code: a 503 here would make the platform
// healthcheck kill the deployment, and an unreachable service cannot tell you
// why it is refusing. The whole point of failing closed rather than failing to
// boot is that the misconfiguration stays visible.
//
//   gateway+token  both — the normal production shape
//   gateway-only   trusts the gateway; direct bearer callers get 503
//   token-only     verifies tokens itself; no trusted edge configured
//   dev-bypass     AUTH_DISABLED=true outside production — everything is 'dev'
//   unconfigured   nothing works; authenticated routes answer 503
function authMode() {
  if (process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production') return 'dev-bypass';
  const gateway = Boolean(process.env.GATEWAY_KEY);
  const token = fb.isConfigured();
  if (gateway && token) return 'gateway+token';
  if (gateway) return 'gateway-only';
  if (token) return 'token-only';
  return 'unconfigured';
}

module.exports = { authMode };
