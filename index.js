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

// Bring the schema up to date, then listen. If the DATABASE is unreachable we
// still listen, so /v1/health can report the degraded state rather than the whole
// process being unreachable. A failed MIGRATION is different and does not listen
// at all — see below.
// Classify the connection FIRST, so a missing schema is reported as that rather
// than as a confusing migration error. Never throws.
const { preflight } = require('./src/configs/dbPreflight');

const { migrateUp, status: migrationStatus } = require('./src/db/migrator');

// MIGRATIONS APPLY THEMSELVES AT BOOT. There is no manual step to forget.
//
// This is NOT a return to `db.sync({ alter: true })`, which is gone for good: it
// dropped any column no longer declared on a model, aborted its whole pass on one
// bad foreign key leaving later models with no tables, and accumulated indexes
// toward MySQL's 64-key limit — on every boot, irreversibly. Migrations are the
// opposite: versioned files, applied once, in order, recorded in
// `schemaMigrations`, and a failure stops at the failing migration.
//
// Boot previously only REPORTED pending migrations and served anyway, which is
// how `cocarr_workspace` ran a full revision with none of its tables — every
// request answering "Table 'cocarr_workspace.jobPostings' doesn't exist" while the
// banner explaining it scrolled past in the logs at startup.
//
// The two reasons that argued for release-step-only are answered, not ignored:
//
//   1. REPLICAS RACING. `migrateUp` holds a MySQL named lock, so a second
//      container waits, then finds nothing pending. See src/db/migrationLock.js.
//   2. A FAILED MIGRATION MUST FAIL THE DEPLOY. It does — the process exits
//      non-zero WITHOUT listening, so the healthcheck never passes and Railway
//      keeps the previous container serving. Booting anyway would be worse than
//      being down: new code writing to columns that may not exist, looking healthy.
//
// Railway also still runs `npm run migrate:up` as a pre-deploy command, which is
// the better place for it — it fails the release before any container starts.
// Boot is the safety net for everywhere that has no release step: local dev, a
// fresh environment, a restored volume. When pre-deploy has already run, boot
// finds nothing pending and this costs one query.
//
// Set AUTO_MIGRATE=false to go back to report-only, for an environment that wants
// schema changes gated by hand.
const AUTO_MIGRATE = process.env.AUTO_MIGRATE !== 'false';

(async () => {
  const { ok } = await preflight(db, Logger);

  // Already reported, in detail, by the preflight. Skip straight to listening so
  // /v1/health can say db:false — that is more diagnosable than an unreachable port.
  if (ok) {
    if (process.env.DB_SYNC === 'true' && process.env.NODE_ENV !== 'production') {
      Logger.error('DB_SYNC=true — using db.sync({alter:true}). Development only; never set this in production.');
      await db.sync({ alter: true }).catch((err) => Logger.error(`Sync failed: ${err.message}`));
      Logger.info('Workspace schema synced (DB_SYNC).');
    } else if (AUTO_MIGRATE) {
      try {
        const applied = await migrateUp({ log: Logger });
        Logger.info(applied.length
          ? `Schema migrated at boot — applied ${applied.length}: ${applied.join(', ')}`
          : 'Schema up to date — nothing to apply.');
      } catch (err) {
        Logger.error('!!! MIGRATION FAILED — NOT SERVING !!!');
        Logger.error(`  ${err?.parent?.sqlMessage || err.message}`);
        Logger.error('  The schema is at the last successfully applied migration; nothing after it ran.');
        Logger.error('  Fix the migration and redeploy. This container is exiting so the previous one keeps serving.');
        // winston's File transport writes asynchronously; exiting immediately can
        // truncate the very banner that explains the failure.
        await new Promise((resolve) => { setTimeout(resolve, 250); });
        process.exit(1);
      }
    } else {
      try {
        const { executed, pending } = await migrationStatus();
        if (pending.length) {
          Logger.error('!!! PENDING MIGRATIONS — THIS REVISION IS RUNNING AGAINST AN OLD SCHEMA !!!');
          Logger.error(`  pending (${pending.length}): ${pending.join(', ')}`);
          Logger.error('  AUTO_MIGRATE=false, so this service will not apply them. Run `npm run migrate:up`.');
        } else {
          Logger.info(`Schema up to date — ${executed.length} migration(s) applied.`);
        }
      } catch (err) {
        Logger.error(`Could not determine migration status: ${err?.parent?.sqlMessage || err.message}`);
      }
    }
  }

  // Bind with NO host argument, so Node listens on :: with dual-stack and accepts
  // both IPv4 and IPv6. Railway's PRIVATE NETWORK IS IPv6-ONLY: a server bound to
  // '0.0.0.0' is reachable from the public edge and completely unreachable from
  // sibling services, which presents as the gateway 502-ing every upstream while
  // each upstream looks perfectly healthy on its own.
  app.listen(PORT, () => Logger.info(`cocarr-workspace-api listening on ${PORT}`));
})();
