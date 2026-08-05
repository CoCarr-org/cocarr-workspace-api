// Hand-maintained OpenAPI 3 description, served at /v1/docs. Kept deliberately
// simple (no build step) — covers the main resources and lifecycle actions.
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Cocarr Workspace API',
    version: '0.1.0',
    description: 'Employee management, HR and organization: recruitment, onboarding, '
      + 'employees, departments, teams, designations, reporting hierarchy and access requests.',
  },
  servers: [{ url: '/v1' }],
  tags: [
    { name: 'Health' }, { name: 'Organization' }, { name: 'Employees' },
    { name: 'Recruitment' }, { name: 'Onboarding' }, { name: 'Access Requests' },
  ],
  paths: {
    '/health': { get: { tags: ['Health'], summary: 'Liveness + DB check', responses: { 200: { description: 'ok' } } } },

    '/departments': {
      get: { tags: ['Organization'], summary: 'List departments', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Organization'], summary: 'Create department', responses: { 201: { description: 'created' } } },
    },
    '/designations': {
      get: { tags: ['Organization'], summary: 'List designations', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Organization'], summary: 'Create designation', responses: { 201: { description: 'created' } } },
    },
    '/teams': {
      get: { tags: ['Organization'], summary: 'List teams', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Organization'], summary: 'Create team', responses: { 201: { description: 'created' } } },
    },

    '/employees': {
      get: { tags: ['Employees'], summary: 'List employees (search, status, departmentId)', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Employees'], summary: 'Create employee (onboarding state)', responses: { 201: { description: 'created' } } },
    },
    '/employees/{id}': {
      get: { tags: ['Employees'], summary: 'Get employee with relations + documents', responses: { 200: { description: 'ok' } } },
      put: { tags: ['Employees'], summary: 'Update employee', responses: { 200: { description: 'ok' } } },
    },
    '/employees/{id}/status': {
      post: { tags: ['Employees'], summary: 'Set employment status (active|suspended|terminated)', responses: { 200: { description: 'ok' } } },
    },
    '/employees/{id}/reports': {
      get: { tags: ['Employees'], summary: 'Direct reports', responses: { 200: { description: 'ok' } } },
    },
    '/employees/org/tree': {
      get: { tags: ['Employees'], summary: 'Reporting hierarchy tree (optional rootId)', responses: { 200: { description: 'ok' } } },
    },
    '/employees/{id}/documents': {
      get: { tags: ['Employees'], summary: 'List employee documents', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Employees'], summary: 'Attach a document', responses: { 201: { description: 'created' } } },
    },

    '/candidates': {
      get: { tags: ['Recruitment'], summary: 'List candidates', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Recruitment'], summary: 'Create candidate', responses: { 201: { description: 'created' } } },
    },
    '/candidates/{id}/advance': {
      post: { tags: ['Recruitment'], summary: 'Advance pipeline stage', responses: { 200: { description: 'ok' } } },
    },
    '/candidates/{id}/hire': {
      post: { tags: ['Recruitment'], summary: 'Hire -> create employee in onboarding', responses: { 201: { description: 'created' } } },
    },

    '/onboarding/{id}': {
      get: { tags: ['Onboarding'], summary: 'Onboarding state for an employee', responses: { 200: { description: 'ok' } } },
    },
    '/onboarding/{id}/advance': {
      post: { tags: ['Onboarding'], summary: 'Advance onboarding stage (profile->documents->review)', responses: { 200: { description: 'ok' } } },
    },
    '/onboarding/{id}/approve': {
      post: {
        tags: ['Onboarding'],
        summary: 'Approve -> mint EMP code + create Firebase login + reset link',
        responses: { 200: { description: 'ok; resetLink returned once' } },
      },
    },

    '/access-requests': {
      get: { tags: ['Access Requests'], summary: 'List access requests', responses: { 200: { description: 'ok' } } },
      post: { tags: ['Access Requests'], summary: 'Raise an access request for an employee', responses: { 201: { description: 'created' } } },
    },
    '/access-requests/{id}/decide': {
      post: { tags: ['Access Requests'], summary: 'Approve/reject (records decision; IAM change is separate)', responses: { 200: { description: 'ok' } } },
    },
  },
};
