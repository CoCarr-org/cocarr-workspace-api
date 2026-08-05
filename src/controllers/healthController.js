const db = require('../configs/db');
const { authMode } = require('../helper/authMode');

// GET /v1/health — liveness + DB reachability. Safe to wire to a Railway
// healthcheck once you want deploys gated on it.
async function health(req, res) {
  let dbOk = false;
  try { await db.authenticate(); dbOk = true; } catch (_) { dbOk = false; }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'cocarr-workspace-api',
    db: dbOk,
    auth: authMode(),
    time: new Date().toISOString(),
  });
}

module.exports = { health };
