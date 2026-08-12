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

## Firebase: optional for staff logins, NEVER optional for auth
`helper/firebaseAdmin.js` is lazy and degrades **for staff-login creation only**:
with no `ADMIN_SERVICE_ACCOUNT`, `approve()` still activates the employee but
sets no `firebaseUid` (logged). A **real** Firebase failure during approve (e.g.
email already exists) is surfaced as a 502, not swallowed.

**Authentication is the opposite — it fails closed.** `authMiddleware` has three
modes: a trusted `x-gateway-key` edge (headers from cocarr-api-gateway, no second
token verification), a dev bypass needing `AUTH_DISABLED=true` **and**
`NODE_ENV !== 'production'`, and direct bearer-token verification. With neither
`GATEWAY_KEY` nor `ADMIN_SERVICE_ACCOUNT`, every authenticated route answers
**503 `AUTH_UNAVAILABLE`**; `GET /v1/health` reports which mode is live (`auth`
field, from `helper/authMode.js`). Unconfigured credentials used to attach a
synthetic dev actor, so a credentials typo in production made this an open API.

> **`fb.verifyIdToken`, never `admin.auth()`.** This service initialises a
> **named** app (`'workspace-admin'`), so `admin.auth()` resolves the default app,
> which does not exist here and throws. The middleware called it that way and
> therefore 401'd every bearer token the moment credentials were configured —
> invisible only because the unconfigured branch skipped authentication entirely.

## Every route is gated on a PLATFORM permission
`middlewares/permissionMiddleware.js` + `helper/authorizationClient.js`. All 36
routes carry `authenticate, requirePermission(module, action)`, which resolves
`workspace.<module>.<action>` against **cocarr-authorization-service**. This
service keeps no permission rules of its own — a second copy would drift from the
first, and the charter puts every decision in one place.

| Router | IAM module |
|---|---|
| departments, designations, teams | `orgStructure` |
| employees, onboarding | `employees` |
| candidates | `recruitment` |
| access-requests | `accessRequests` |

Onboarding is governed by `employees` because it is a stage of the employee
lifecycle, not a separate thing to grant. Non-CRUD verbs map to the nearest
action: `/hire`, `/advance`, `/decide` and `/:id/status` are all `update`.

**Reads were previously unauthenticated entirely** — the whole employee
directory, org chart and candidate pipeline were readable by anyone who could
reach the port. Every GET now requires both authentication and a `read` permission.

**Enforcement is ON by default** (`RBAC_ENFORCE=false` ⇒ dry-run: denials logged,
requests allowed). Same flag name and meaning as core-api's, deliberately — two
services in one platform disagreeing about what their enforcement switch means is
how somebody turns off more than they intended.

**A broken check is a DENIAL, not a pass.** IAM unreachable, slow, erroring, or
refusing our gateway key ⇒ **503 `AUTHORIZATION_UNAVAILABLE`**. "The check broke"
is not a reason to perform an unchecked write; core-api closed this exact
fail-open path and this service starts closed. Note `fetch` does not throw on a
4xx/5xx, so the client checks `res.ok` explicitly — without that an error body
parses into an empty permission list and reads as "holds nothing", a silent total
denial that looks like a permissions bug rather than the outage it is.

**The dev-bypass actor is exempt.** It is not a real principal and has no
assignments, so without the exemption every local request would 403 the moment
IAM was reachable — and people would set `RBAC_ENFORCE=false` and leave it there,
which is far worse than one narrow, explicit carve-out.

**Permissions are cached for `PERMISSION_CACHE_MS` (default 15s)**, so a
revocation takes up to that long to bite. Without a cache every gated call is two
HTTP round-trips; `authorizationClient.forget(principalId)` clears one early.

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
- The app **listens even if the DB is unreachable**, so `/v1/health` can report
  `db:false` rather than the process being unreachable. A failed **migration** is
  the one exception: it exits non-zero without listening (see below).

## Schema: migrations apply themselves at boot
Pending migrations run automatically at startup — there is no manual step, and no
`migrate:up` to forget. `db.sync({alter:true})` is **not** coming back; migrations
are versioned files applied once, in order, recorded in `schemaMigrations`.

- Serialised across processes by a **MySQL named lock** (`src/db/migrationLock.js`),
  so two replicas starting together cannot run the same DDL concurrently. The
  second waits, then finds nothing pending.
- A **failed** migration exits the process **without listening**, so the
  healthcheck never passes and the previous container keeps serving. Booting
  against a half-built schema is worse than being down — it looks healthy.
- Railway still runs `npm run migrate:up` as `preDeployCommand` (railway.json);
  that is the better place for it. Boot is the safety net for everywhere with no
  release step: local dev, a fresh environment, a restored volume.
- `AUTO_MIGRATE=false` reverts to report-only.

This existed as a manual step and was missed: the service ran a full revision with
none of its tables, answering `Table 'cocarr_workspace.jobPostings' doesn't exist`
on every request while the banner explaining it scrolled past at startup.

Schema *creation* is still separate and deliberate (`scripts/ensureDatabase.js`) —
a typo in `DB_NAME` must fail loudly, not silently build a decoy schema.
- Verified against a real MySQL: schema syncs (8 tables); permission enforcement
  is live against cocarr-authorization-service — an operations-agent gets
  `403 workspace.employees.read`, an hr-manager is served, and their
  `POST /departments` persists a row. All four IAM failure modes (500, 401,
  unreachable, absent) answer 503 rather than allowing.

## Not built yet (next)
- Object-storage upload for employee documents (currently stores a `fileKey`
  provided by the client; wire the same private-bucket proxy pattern as core-api).
- IAM application on access-request approval — an approved request still leaves
  `iamApplied` false. The approval CHAIN now exists in IAM
  (`workspace.access-request.default`); writing the resulting role assignment
  back is the remaining half.
- Notifications and Settings sub-domains.
- Tests.
