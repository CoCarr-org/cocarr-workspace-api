// ONLY ONE PROCESS MAY MIGRATE AT A TIME.
//
// Migrations now run automatically at boot (see index.js), which reintroduces
// the one hazard the release-step-only rule existed to avoid: two containers
// starting together both find the same migration pending and both run it. MySQL
// DDL is not transactional, so that does not produce a clean winner — it
// produces a half-applied change and no way to tell which side got there first.
//
// A MySQL named lock closes that. The second process blocks until the first has
// finished, then re-reads `schemaMigrations`, finds nothing pending, and moves
// on. Nothing is applied twice, and neither process has to know the other exists.
//
// WHY A SEPARATE ONE-CONNECTION SEQUELIZE AND NOT `db`.
//
// GET_LOCK/RELEASE_LOCK are scoped to a SESSION: only the connection that took
// the lock can release it, and the lock dies with that connection. Issued over
// the service's shared pool, the release could land on a different connection
// than the acquire and fail — leaving the lock held until the process exits, at
// which point every subsequent boot waits the full timeout for nothing.
//
// `min: 1` with a very long idle keeps the pool from evicting the connection
// underneath a long migration, which would silently drop the lock mid-run.
const { Sequelize, QueryTypes } = require('sequelize');

// Namespaced by schema: MySQL named locks are INSTANCE-WIDE, and this platform
// runs every service's schema on one instance. An unqualified name like
// 'migrations' would make core-api's release step block workspace's.
const LOCK_NAME = `cocarr_migrations_${process.env.DB_NAME || 'unknown'}`;

// Long enough to outlast a real migration on the other side, short enough that a
// genuinely stuck lock surfaces as an error rather than a hung deploy.
const DEFAULT_WAIT_SECONDS = 120;

function buildLockConnection() {
  return new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false,
      pool: { max: 1, min: 1, idle: 24 * 60 * 60 * 1000 },
    },
  );
}

// Runs `fn` with the migration lock held. Releases it on every path, including
// when `fn` throws — the error is re-thrown unchanged so the caller still sees
// the real migration failure rather than a lock error.
async function withMigrationLock(fn, { log = console, waitSeconds = DEFAULT_WAIT_SECONDS } = {}) {
  const lockDb = buildLockConnection();
  let held = false;

  try {
    const rows = await lockDb.query('SELECT GET_LOCK(?, ?) AS acquired', {
      type: QueryTypes.SELECT,
      replacements: [LOCK_NAME, waitSeconds],
    });

    // 1 = acquired, 0 = timed out waiting, NULL = the lock request errored.
    const acquired = rows?.[0]?.acquired;
    if (Number(acquired) !== 1) {
      throw new Error(
        `Could not acquire the migration lock '${LOCK_NAME}' within ${waitSeconds}s `
        + `(GET_LOCK returned ${acquired === null ? 'NULL' : acquired}). `
        + 'Another process is migrating, or one died holding it.',
      );
    }
    held = true;
    log.info?.(`[migrate] holding lock ${LOCK_NAME}`);

    return await fn();
  } finally {
    if (held) {
      await lockDb.query('SELECT RELEASE_LOCK(?)', {
        type: QueryTypes.SELECT,
        replacements: [LOCK_NAME],
      }).catch(() => {}); // closing the connection below releases it regardless
    }
    await lockDb.close().catch(() => {});
  }
}

module.exports = { withMigrationLock, LOCK_NAME };
