# cocarr-workspace-api

> Workspace API for Employee Management, HR and Organization.

Part of the **Cocarr Enterprise Platform** ([CoCarr-org](https://github.com/CoCarr-org)).

Topics: `workspace`, `employees`, `hr`, `express`, `node`

## Purpose
The Workspace domain of the Cocarr platform — the genuinely new product built
alongside the migrated Core API. It owns the employee lifecycle end to end:
**recruitment → onboarding → approval → staff-login creation → workspace access →
access requests**, plus the organization structure (departments, teams,
designations) and the reporting hierarchy.

> Workspace is **not** an HRMS. It deliberately does **not** cover attendance,
> leave, payroll, performance, assets, expenses, training or shift planning.

## Architecture
Express + Sequelize (MySQL) service, same stack and conventions as
[`cocarr-core-api`](https://github.com/CoCarr-org/cocarr-core-api): a
controller → service → model layering, a `crudFactory` for plain CRUD, winston
logging, express-validator, and the shared `{ error: { code, message } }`
response contract. Firebase Admin (the same staff/admin project as core-api) is
used only to create a login for an employee at the end of onboarding.

## Technology Stack
- Node.js + Express
- Sequelize ORM (MySQL)
- Firebase Admin (staff-login creation — optional; onboarding still works without it in dev)
- express-validator, winston, swagger-ui-express

## Folder Structure
```
index.js                     # Entry; registers models, syncs schema, mounts /v1
src/configs/db.js            # Sequelize (MySQL) connection
src/models/                  # department, designation, team, employee,
                             #   employeeDocument, candidate, accessRequest, counter
src/models/index.js          # Model registration + associations (one place)
src/services/                # crudFactory + employee/recruitment/onboarding/accessRequest
src/controllers/             # thin HTTP handlers (crudController + bespoke)
src/routes/                  # rootRouter + per-resource routers
src/middlewares/             # error, authMiddleware (Firebase verify + dev hatch)
src/helper/                  # logger, firebaseAdmin (lazy/optional)
src/utils/                   # employeeCode (EMP-000001), validate
src/docs/openapi.js          # OpenAPI 3 spec served at /v1/docs
```

## Getting Started
```bash
git clone https://github.com/CoCarr-org/cocarr-workspace-api.git
cd cocarr-workspace-api
git checkout develop
cp .env.example .env         # set DB_* (and ADMIN_SERVICE_ACCOUNT for real logins)
npm install
npm run dev                  # http://localhost:3040/v1/health , docs at /v1/docs
```
For a local DB, use the compose stack in
[`cocarr-devops`](https://github.com/CoCarr-org/cocarr-devops)
(`docker/docker-compose.dev.yml`), or set `AUTH_DISABLED=true` to run without
Firebase during development.

## Key endpoints
| Method | Path | What |
|---|---|---|
| GET | `/v1/health` | liveness + DB check |
| GET | `/v1/docs` | Swagger UI |
| CRUD | `/v1/departments`, `/v1/designations`, `/v1/teams` | organization structure |
| GET/POST | `/v1/employees` | list / create (search, status, departmentId) |
| GET | `/v1/employees/org/tree` | reporting hierarchy tree |
| GET | `/v1/employees/:id/reports` | direct reports |
| POST | `/v1/employees/:id/status` | active / suspended / terminated |
| CRUD | `/v1/candidates` | recruitment pipeline |
| POST | `/v1/candidates/:id/hire` | hire → employee in onboarding |
| GET/POST | `/v1/onboarding/:id`, `/advance`, `/approve` | onboarding lifecycle |
| GET/POST | `/v1/access-requests`, `/:id/decide` | additional-access workflow |

See [`CLAUDE.md`](CLAUDE.md) for the employee-identity rule, the onboarding state
machine, and the Firebase/IAM integration boundaries.

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). Feature branches from `develop`.

## Branch Strategy
| Branch | Purpose | Protected |
|---|---|---|
| `main` | production baseline | Yes |
| `develop` | integration / working branch | No |
| `release` | release-candidate | Yes |

## Deployment
Containerised (`Dockerfile`) and deployed on Railway (`railway.json`, healthcheck
`/v1/health`) from `develop`. Talks to `cocarr-workspace-db`. See
[`cocarr-devops/docs/DEPLOYMENT.md`](https://github.com/CoCarr-org/cocarr-devops).

## License
[MIT](LICENSE).
