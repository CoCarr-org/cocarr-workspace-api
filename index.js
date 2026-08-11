require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// winston's File transport needs the directory to exist.
fs.mkdirSync('logs', { recursive: true });

const Logger = require('./src/helper/logger');
// Register every model + association BEFORE db.sync (same discipline as core-api).
const { db } = require('./src/models');
const rootRouter = require('./src/routes/rootRouter');
const { errorHandlerMiddleware } = require('./src/middlewares/error');

const app = express();

// CORS allowlist (comma-separated). Unset = allow all with a warning.
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);
if (CORS_ORIGINS.length === 0) {
  console.warn('[cors] CORS_ORIGINS not set — allowing every origin. Set it in production.');
  app.use(cors({ origin: '*' }));
} else {
  app.use(cors({
    origin: (origin, cb) => (!origin || CORS_ORIGINS.includes(origin)
      ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
    credentials: true,
  }));
}

app.use(bodyParser.json({ limit: '12mb' }));
app.use(bodyParser.urlencoded({ limit: '12mb', extended: true }));

app.use('/v1', rootRouter);
app.use(errorHandlerMiddleware);

const PORT = process.env.PORT || 3040;

// Sync the schema, then listen. If sync fails (e.g. DB not reachable at boot) we
// still listen so /v1/health can report the degraded state rather than the whole
// process being unreachable.
// Classify the connection BEFORE sync, so a missing schema is reported as that
// rather than as a confusing sync error. Never throws.
const { preflight } = require('./src/configs/dbPreflight');

preflight(db, Logger)
  .then(({ ok }) => {
    if (!ok) return Promise.reject(new Error('database unreachable'));
    return db.sync({ alter: true }).then(() => Logger.info('Workspace schema synced.'));
  })
  .catch((err) => {
    if (err.message === 'database unreachable') return; // already reported above
    Logger.error('!!! SCHEMA SYNC FAILED — TABLES MAY BE MISSING !!!');
    Logger.error(`  reason: ${err?.parent?.sqlMessage || err.message}`);
    Logger.error('  Check with scripts/ensureDatabase.js --dry-run');
  })
  .finally(() => {
// Bind with NO host argument, so Node listens on :: with dual-stack and accepts
// both IPv4 and IPv6. Railway's PRIVATE NETWORK IS IPv6-ONLY: a server bound to
// '0.0.0.0' is reachable from the public edge and completely unreachable from
// sibling services, which presents as the gateway 502-ing every upstream while
// each upstream looks perfectly healthy on its own.
    app.listen(PORT, () => Logger.info(`cocarr-workspace-api listening on ${PORT}`));
  });
