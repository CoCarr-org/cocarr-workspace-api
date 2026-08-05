# cocarr-workspace-api

New Express + Sequelize (MySQL) service for the Cocarr **Workspace** domain
(employees, HR, organization). Built to mirror `cocarr-core-api`'s conventions
so the two services share one operational and code shape.

**Working branch: `develop`.**

## What it is / isn't
Owns: recruitment, onboarding, employees, departments, teams, designations,
organization structure, reporting hierarchy, employee documents, access requests.
**Not an HRMS** — no attendance/leave/payroll/performance/assets/expenses/
training/shift planning by design.

## Employee identity — the load-bearing rule
`employee.employeeCode` (**EMP-000001**) is the business identity, **never** the
Firebase UID. `employee.firebaseUid` is a *separate*, nullable column, populated
only when a staff login is created at onboarding approval. Codes are allocated
from the `counter` table under a row lock (`utils/employeeCode.js`) so two
concurrent approvals can't collide.

## The lifecycle (charter)
```
Candidate (recruitment)
  └─ POST /candidates/:id/hire ─► Employee { status: onboarding, stage: profile }
Onboarding
  profile ─► documents ─► review        (POST /onboarding/:id/advance, one step at a time)
  review  ─► POST /onboarding/:id/approve
              ├─ mint EMP-000001 (if absent)
              ├─ create Firebase staff login  ──► employee.firebaseUid
              ├─ generate password reset link ──► returned ONCE in the response
              └─ status = active, stage = approved, dateOfJoining defaulted
```
- **`advance` can't skip stages or go backwards, and can't reach `approved`** —
  approval is the only path to `approved`, because that's where the code + login
  are minted.
- **The reset link is returned once** (like core-api admin creation) — there's no
  re-fetch endpoint yet. Hand it to the employee.

## Firebase is optional in dev
`helper/firebaseAdmin.js` is lazy and degrades: with no `ADMIN_SERVICE_ACCOUNT`,
staff-login creation is disabled, `approve()` still activates the employee but
sets no `firebaseUid` (logged), and `authMiddleware` attaches a synthetic dev
actor. A **real** Firebase failure during approve (e.g. email already exists) is
surfaced as a 502, not swallowed. Never set `AUTH_DISABLED=true` in production.

## Access requests are workflow-only (for now)
`POST /access-requests` + `/:id/decide` record an approve/reject decision. They
do **not** grant access — the actual IAM change is owned by the authorization
service / core-api (`resolveAccess`/`requirePermission`). `accessRequest.iamApplied`
stays `false` until that integration is wired; do not treat an approved request
as effective access.

## Conventions carried from core-api
- Models: `db.define`, uuid string PKs, one `models/index.js` that registers
  every model + all associations **before** `index.js` runs `db.sync({alter:true})`.
- `crudFactory` (list/search/paginate/get/create/update/remove) + a generic
  `crudController` so plain-CRUD resources need no bespoke controller.
- Error contract: `CustomError(message, status, code)` → `{ error: { code, message } }`.
- Routers: static/segment routes registered **before** `/:id` (e.g.
  `/employees/org/tree` before `/employees/:id`).

## Run / verify
- `PORT` (default **3040**), binds `0.0.0.0`. Health: `GET /v1/health`. Docs: `/v1/docs`.
- The app **listens even if the DB sync fails** (`.finally`), so `/v1/health`
  can report `db:false` rather than the process being unreachable.
- Verified so far: all files syntax-clean, full require/wiring graph loads,
  live HTTP smoke test (health/docs/validation/error-contract/404) with the DB
  intentionally unreachable. A full DB-backed lifecycle run needs a MySQL
  instance (see `cocarr-devops` compose).

## Not built yet (next)
- Object-storage upload for employee documents (currently stores a `fileKey`
  provided by the client; wire the same private-bucket proxy pattern as core-api).
- IAM application on access-request approval (call authorization service/core-api).
- Notifications and Settings sub-domains.
- Tests.
