#!/usr/bin/env node
/**
 * Seed the organisation structure — departments, teams and designations.
 *
 *   node scripts/seedOrganisation.js --dry-run
 *   node scripts/seedOrganisation.js --confirm
 *
 * IDEMPOTENT AND ADDITIVE. Matched on the natural key (department code,
 * designation title, team name within its department), so a re-run creates
 * nothing. It NEVER renames or deletes: somebody who renamed a department in the
 * UI made a decision, and a seed that restored the original on the next deploy
 * would revert it with no trace — the same rule seedTaxonomy.js follows.
 *
 * Departments are created in two passes because they nest: every row first, then
 * the parent links. One pass would need the source ordered so a parent always
 * precedes its children, which is a constraint on the data file that nothing
 * enforces and that breaks silently the first time somebody reorders it.
 */
const { db, Department, Team, Designation } = require('../src/models');
const { DEPARTMENTS, TEAMS, DESIGNATIONS } = require('../src/seeds/organisation');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const DRY = !CONFIRM;

const counts = {
  deptCreated: 0, deptExisting: 0, deptLinked: 0,
  teamCreated: 0, teamExisting: 0,
  desigCreated: 0, desigExisting: 0,
};

(async () => {
  console.log(DRY ? '=== DRY RUN — nothing is written ===' : '=== SEEDING ORGANISATION (--confirm) ===');
  await db.sync();

  // ── departments, pass 1: the rows ────────────────────────────────────────
  const byCode = {};
  for (const d of DEPARTMENTS) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await Department.findOne({ where: { code: d.code } });
    if (existing) {
      byCode[d.code] = existing;
      counts.deptExisting++;
      console.log(`  = department ${d.code.padEnd(5)} ${d.name}`);
      continue;
    }
    counts.deptCreated++;
    console.log(`  ${DRY ? '+ would create' : '+ created'} department ${d.code.padEnd(5)} ${d.name}`);
    if (DRY) continue;
    // eslint-disable-next-line no-await-in-loop
    byCode[d.code] = await Department.create({
      code: d.code, name: d.name, description: d.description || null,
    });
  }

  // ── departments, pass 2: the nesting ─────────────────────────────────────
  if (!DRY) {
    for (const d of DEPARTMENTS) {
      if (!d.parent) continue;
      const self = byCode[d.code]; const parent = byCode[d.parent];
      if (!self || !parent || self.parentDepartmentId === parent.id) continue;
      // eslint-disable-next-line no-await-in-loop
      await self.update({ parentDepartmentId: parent.id });
      counts.deptLinked++;
      console.log(`  ↳ ${d.code} reports to ${d.parent}`);
    }
  }

  // ── designations ─────────────────────────────────────────────────────────
  for (const g of DESIGNATIONS) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await Designation.findOne({ where: { title: g.title } });
    if (existing) { counts.desigExisting++; continue; }
    counts.desigCreated++;
    console.log(`  ${DRY ? '+ would create' : '+ created'} designation ${String(g.level).padStart(3)} ${g.title}`
      + (g.role ? `   (IAM role: ${g.role})` : ''));
    if (DRY) continue;
    // eslint-disable-next-line no-await-in-loop
    await Designation.create({ title: g.title, level: g.level, description: g.description || null });
  }

  // ── teams ────────────────────────────────────────────────────────────────
  for (const t of TEAMS) {
    const dept = byCode[t.department];
    if (!dept && !DRY) { console.log(`  ! team "${t.name}": department ${t.department} missing, skipped`); continue; }
    // Team names are only unique WITHIN a department — the model does not
    // constrain them globally, and two departments may each want a "Support"
    // team. Matching on the pair is what makes a re-run safe.
    // eslint-disable-next-line no-await-in-loop
    const existing = dept ? await Team.findOne({ where: { name: t.name, departmentId: dept.id } }) : null;
    if (existing) { counts.teamExisting++; continue; }
    counts.teamCreated++;
    console.log(`  ${DRY ? '+ would create' : '+ created'} team ${t.department.padEnd(5)} ${t.name}`);
    if (DRY) continue;
    // eslint-disable-next-line no-await-in-loop
    await Team.create({ name: t.name, departmentId: dept.id, description: t.description || null });
  }

  console.log('\n---');
  console.log(`departments  created=${counts.deptCreated} existing=${counts.deptExisting} linked=${counts.deptLinked}`);
  console.log(`designations created=${counts.desigCreated} existing=${counts.desigExisting}`);
  console.log(`teams        created=${counts.teamCreated} existing=${counts.teamExisting}`);
  if (DRY) console.log('DRY RUN complete — re-run with --confirm to apply.');

  await db.close();
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
