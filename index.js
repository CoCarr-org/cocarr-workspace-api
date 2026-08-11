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
const { mountVersions } = require('./src/routes/apiVersions');
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

// Every supported API version is mounted from one registry, which also emits
// the Deprecation/Sunset headers and serves GET /versions.
mountVersions(app, { log: Logger });
app.use(errorHandlerMiddleware);

const PORT = process.env.PORT || 3040;

// Sync the schema, then listen. If sync fails (e.g. DB not reachable at boot) we
// still listen so /v1/health can report the degraded state rather than the whole
// process being unreachable.
// Classify the connection BEFORE sync, so a missing schema is reported as that
// rather than as a confusing sync error. Never throws.
const { preflight } = require('./src/configs/dbPreflight');

const { status: migrationStatus } = require('./src/db/migrator');

// THE SERVICE NO LONGER CHANGES THE SCHEMA. Migrations do, as a release step
// (`npm run migrate:up`), before the new revision takes traffic.
//
// `db.sync({ alter: true })` is gone from the boot path: it dropped any column
// no longer declared on a model, aborted its whole pass on one bad foreign key
// leaving later models with no tables, and accumulated indexes toward MySQL's
// 64-key limit — on every boot, irreversibly. With 12 tables carrying real
// foreign keys between them, an aborted pass here silently loses whichever
// tables happened to come after the failure.
//
// Boot now only REPORTS drift. Development can still use sync explicitly via
// DB_SYNC=true.
preflight(db, Logger)
  .then(async ({ ok }) => {
    if (!ok) return; // already reported, in detail, by the preflight

    if (process.env.DB_SYNC === 'true' && process.env.NODE_ENV !== 'production') {
      Logger.error('DB_SYNC=true — using db.sync({alter:true}). Development only; never set this in production.');
      await db.sync({ alter: true });
      Logger.info('Workspace schema synced (DB_SYNC).');
      return;
    }

    const { executed, pending } = await migrationStatus();
    if (pending.length) {
      Logger.error('!!! PENDING MIGRATIONS — THIS REVISION IS RUNNING AGAINST AN OLD SCHEMA !!!');
      Logger.error(`  pending (${pending.length}): ${pending.join(', ')}`);
      Logger.error('  Run `npm run migrate:up` as a release step BEFORE this revision takes traffic.');
      return;
    }
    Logger.info(`Schema up to date — ${executed.length} migration(s) applied.`);
  })
  .catch((err) => {
    Logger.error(`Could not determine migration status: ${err?.parent?.sqlMessage || err.message}`);
  })
  .finally(() => {
// Bind with NO host argument, so Node listens on :: with dual-stack and accepts
// both IPv4 and IPv6. Railway's PRIVATE NETWORK IS IPv6-ONLY: a server bound to
// '0.0.0.0' is reachable from the public edge and completely unreachable from
// sibling services, which presents as the gateway 502-ing every upstream while
// each upstream looks perfectly healthy on its own.
    app.listen(PORT, () => Logger.info(`cocarr-workspace-api listening on ${PORT}`));
  });
