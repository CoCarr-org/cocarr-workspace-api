#!/usr/bin/env node
/**
 * Migrate legacy COCARR-BACKEND `admins` into Workspace `employees`, and give
 * each one the baseline `employee` role in IAM.
 *
 *   node scripts/migrateLegacyAdmins.js --dry-run
 *   node scripts/migrateLegacyAdmins.js --confirm
 *
 * Source connection (the legacy database, read ONLY):
 *   LEGACY_DB_HOST LEGACY_DB_PORT LEGACY_DB_USER LEGACY_DB_PASS LEGACY_DB_NAME
 * Destination is this service's own DB_* vars, so it must run where those
 * resolve — inside Railway, since the platform MySQL has no public proxy.
 *
 * WHY ADMINS BECOME EMPLOYEES: in the legacy product an "admin" was a member of
 * staff with a login. The new platform splits those two ideas — Workspace owns
 * the person, IAM owns what they may do — so a legacy admin row becomes an
 * employee plus a role assignment, never a single privileged record.
 *
 * IT NEVER READS A PASSWORD OR TOKEN. Legacy `admins` holds a Firebase uid, and
 * that is carried across verbatim: the same person signs in with the same
 * credential afterwards, and nothing about their authentication changes.
 *
 * IDEMPOTENT, keyed on EMAIL. Re-running skips anyone already present rather
 * than minting a second employee code for them. Email is the key rather than the
 * legacy id because the legacy id means nothing here and the email is what a
 * human matches on.
 *
 * READ-ONLY AT THE SOURCE. It issues one SELECT and never writes to the legacy
 * database — a migration that can damage the thing it is copying from is a
 * migration nobody can safely re-run.
 */
const mysql = require('mysql2/promise');
const { db, Employee } = require('../src/models');
const { nextEmployeeCode } = require('../src/utils/employeeCode');
const iam = require('../src/helper/authorizationClient');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const DRY = !CONFIRM;
const DEFAULT_ROLE_KEY = process.env.DEFAULT_EMPLOYEE_ROLE_KEY || 'employee';

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
  return v;
};

// A legacy admin has one `name`; Employee has firstName/lastName. Split on the
// first space and keep the remainder together, so "Prakash iAppWiz" survives and
// a single-word name simply has no surname rather than a fabricated one.
function splitName(name, email) {
  const clean = String(name || '').trim();
  if (!clean) return { firstName: (email || 'unknown').split('@')[0], lastName: null };
  const i = clean.indexOf(' ');
  if (i === -1) return { firstName: clean, lastName: null };
  return { firstName: clean.slice(0, i), lastName: clean.slice(i + 1).trim() || null };
}

(async () => {
  console.log(DRY ? '=== DRY RUN — nothing is written ===' : '=== MIGRATING (--confirm) ===');

  const src = await mysql.createConnection({
    host: need('LEGACY_DB_HOST'),
    port: parseInt(process.env.LEGACY_DB_PORT || '3306', 10),
    user: need('LEGACY_DB_USER'),
    password: process.env.LEGACY_DB_PASS || '',
    database: need('LEGACY_DB_NAME'),
  });

  const [rows] = await src.execute(
    'SELECT id, uid, name, email, mobile, role, isActive, createdAt FROM admins ORDER BY createdAt ASC',
  );
  await src.end();
  console.log(`Legacy admins found: ${rows.length}`);

  await db.sync();

  // Resolve the baseline role once. If it is missing, stop before writing
  // anything: employees with no role hold nothing at all, and discovering that
  // after the fact means chasing every row by hand.
  let roleId = null;
  try {
    const roles = await iam.listRoles();
    const match = (roles?.data || roles || []).find((r) => r.key === DEFAULT_ROLE_KEY);
    if (!match) {
      console.error(`\nNo IAM role with key "${DEFAULT_ROLE_KEY}". Seed it first:`);
      console.error('  node scripts/seedTaxonomy.js --confirm   (in cocarr-authorization-service)');
      process.exit(1);
    }
    roleId = match.id;
    console.log(`Baseline role: ${match.name} (${match.key})`);
  } catch (e) {
    console.error(`\nCould not reach IAM to resolve the baseline role: ${e.message}`);
    console.error('Refusing to create employees who would hold no permissions at all.');
    process.exit(1);
  }

  const summary = {
    created: 0, skipped: 0, assigned: 0, assignFailed: 0, noPrincipal: 0,
  };

  for (const a of rows) {
    const email = String(a.email || '').trim().toLowerCase();
    if (!email) { console.log(`  SKIP (no email) legacy id ${a.id}`); summary.skipped++; continue; }

    // eslint-disable-next-line no-await-in-loop
    const existing = await Employee.findOne({ where: { email } });
    if (existing) {
      console.log(`  SKIP ${email} — already an employee (${existing.employeeCode || 'no code'})`);
      summary.skipped++;
      continue;
    }

    const { firstName, lastName } = splitName(a.name, email);

    // Legacy admins are people already working here, so they arrive ACTIVE and
    // approved rather than at the start of onboarding. Sending them through the
    // approval chain would ask somebody to re-approve a colleague who has been
    // signing in for months, and would mint a second Firebase login for an
    // account that already has one.
    const payload = {
      firstName,
      lastName,
      email,
      phone: a.mobile || null,
      firebaseUid: a.uid || null,
      status: a.isActive ? 'active' : 'suspended',
      onboardingStage: 'approved',
      // No department, per instruction — assigned later, deliberately.
      departmentId: null,
      designationId: null,
      teamId: null,
      dateOfJoining: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : null,
    };

    if (DRY) {
      console.log(`  WOULD CREATE ${email}  ${firstName} ${lastName || ''}`.trimEnd()
        + `  status=${payload.status} uid=${a.uid ? 'yes' : 'none'}`);
      summary.created++;
      if (a.uid) summary.assigned++; else summary.noPrincipal++;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const code = await nextEmployeeCode();
    // eslint-disable-next-line no-await-in-loop
    const emp = await Employee.create({ ...payload, employeeCode: code });
    console.log(`  CREATED ${email} -> ${code}`);
    summary.created++;

    // The principal IAM knows them by is their Firebase uid, which is what the
    // gateway sends as x-user-id. Without one there is nothing to assign a role
    // to — reported rather than silently skipped, because that person will sign
    // in one day and hold nothing.
    if (!a.uid) {
      console.log(`    ! no Firebase uid — no role assigned; they will hold nothing until one exists`);
      summary.noPrincipal++;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await iam.assignRole({
        principalId: a.uid,
        roleId,
        reason: `Legacy admin migration (${email})`,
      }, 'system:legacy-migration');
      console.log(`    assigned ${DEFAULT_ROLE_KEY}`);
      summary.assigned++;
    } catch (e) {
      // The employee exists either way; the grant is retryable. Losing the row
      // because a second service was briefly unreachable would be worse.
      console.log(`    ! role assignment FAILED: ${e.message} (re-run to retry)`);
      summary.assignFailed++;
    }
  }

  console.log('\n---');
  console.log(`created=${summary.created} skipped=${summary.skipped} `
    + `roleAssigned=${summary.assigned} assignFailed=${summary.assignFailed} noFirebaseUid=${summary.noPrincipal}`);
  if (DRY) console.log('DRY RUN complete — re-run with --confirm to apply.');

  await db.close();
  process.exit(0);
})().catch((e) => { console.error('MIGRATION FAILED:', e); process.exit(1); });
