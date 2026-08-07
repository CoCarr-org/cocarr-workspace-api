// THE COCARR ORGANISATION — departments, teams and designations.
//
// DERIVED FROM THE ACCESS MODEL, not invented alongside it. The shape comes from
// two things that already exist and already describe this company:
//
//   1. The Access Matrix spec's ten roles (adminRoles.js in the legacy backend):
//      Super Administrator, Platform Administrator, Operations Manager, Support
//      Executive, Finance Manager, KYC & Compliance, Fleet Manager, Marketing
//      Manager, Analytics Viewer, Developer / DevOps.
//   2. The seven admin panels (adminPanels.js): root, admin, ops, support,
//      finance, growth, developer.
//
// Those two lists agree on which functions the business has, so the departments
// mirror them one for one. A structure invented independently would drift from
// the permissions on day one, and the first symptom would be somebody in a
// department whose designation maps to no role — which reads as a permissions
// bug and gets debugged in the wrong place.
//
// EVERY NAME HERE IS EDITABLE. This is a starting structure, not a claim about
// how the company must be organised: departments and teams are ordinary rows
// with a CRUD screen behind them.

// `parent` is a department CODE, resolved after the first pass so the file can
// be read top-down. Executive is the root; everything else hangs off it, which
// is what makes `orgTree` return one tree rather than seven.
const DEPARTMENTS = [
  { code: 'EXEC', name: 'Executive', parent: null, description: 'Company leadership.' },
  { code: 'TECH', name: 'Technology', parent: 'EXEC', description: 'Platform engineering, infrastructure and internal tooling.' },
  { code: 'OPS', name: 'Operations', parent: 'EXEC', description: 'Day-to-day running of the fleet, bookings and trips.' },
  { code: 'SUP', name: 'Customer Support', parent: 'EXEC', description: 'Rider and host support, disputes and escalations.' },
  { code: 'FIN', name: 'Finance', parent: 'EXEC', description: 'Payments, settlements, refunds and accounting.' },
  { code: 'GRW', name: 'Growth & Marketing', parent: 'EXEC', description: 'Campaigns, referrals, partnerships and analytics.' },
  { code: 'RSK', name: 'Risk & Compliance', parent: 'EXEC', description: 'KYC, document verification, fraud and regulatory compliance.' },
  { code: 'PPL', name: 'People & Culture', parent: 'EXEC', description: 'Recruitment, onboarding and HR operations.' },
];

// Teams are the working units inside a department. Kept deliberately few: a team
// per person is an org chart nobody maintains, and the grid that gates access is
// the ROLE, not the team.
const TEAMS = [
  { name: 'Platform Engineering', department: 'TECH', description: 'The customer-facing platform and its services.' },
  { name: 'Infrastructure & DevOps', department: 'TECH', description: 'Deployments, environments, observability.' },
  { name: 'Fleet', department: 'OPS', description: 'Vehicle onboarding, RC verification and availability.' },
  { name: 'Bookings & Dispatch', department: 'OPS', description: 'Live trips, handovers and ride issues.' },
  { name: 'Rider Support', department: 'SUP', description: 'First line for riders.' },
  { name: 'Host Support', department: 'SUP', description: 'First line for hosts and their payouts.' },
  { name: 'Payments & Settlements', department: 'FIN', description: 'Gateway reconciliation, host settlements, refunds.' },
  { name: 'Accounting', department: 'FIN', description: 'Books, invoices and tax.' },
  { name: 'Campaigns', department: 'GRW', description: 'Email, SMS and push campaigns; referral programmes.' },
  { name: 'Analytics', department: 'GRW', description: 'Reporting and business intelligence.' },
  { name: 'KYC & Verification', department: 'RSK', description: 'Identity, licence and document review.' },
  { name: 'Recruitment', department: 'PPL', description: 'Hiring pipeline and candidate experience.' },
  { name: 'HR Operations', department: 'PPL', description: 'Onboarding, records and employee lifecycle.' },
];

// `level` is SENIORITY, and LOWER IS MORE SENIOR — the same convention as the
// admin panel tiers, where 0 is root. Gaps are deliberate: a grade can be
// inserted later without renumbering everything below it.
//
// The titles that match an IAM role carry `role`, which is documentation rather
// than enforcement — nothing reads it, and access still comes from an explicit
// role assignment. It is here so the two lists can be checked against each other
// by eye instead of from memory.
const DESIGNATIONS = [
  { title: 'Chief Executive Officer', level: 10 },
  { title: 'Head of Technology', level: 20 },
  { title: 'Head of Operations', level: 20 },
  { title: 'Head of Finance', level: 20 },
  { title: 'Head of Growth', level: 20 },
  { title: 'Head of People', level: 20 },
  { title: 'Platform Administrator', level: 30, role: 'platform-admin' },
  { title: 'Operations Manager', level: 30, role: 'operations-manager' },
  { title: 'Fleet Manager', level: 30 },
  { title: 'Finance Manager', level: 30, role: 'finance-manager' },
  { title: 'Marketing Manager', level: 30 },
  { title: 'HR Manager', level: 30, role: 'hr-manager' },
  { title: 'Engineering Lead', level: 40 },
  { title: 'Developer / DevOps Engineer', level: 40 },
  { title: 'KYC & Compliance Officer', level: 50 },
  { title: 'Support Executive', level: 50, role: 'support-agent' },
  { title: 'Recruiter', level: 50, role: 'recruiter' },
  { title: 'Operations Agent', level: 60, role: 'operations-agent' },
  { title: 'Analytics Viewer', level: 60 },
  { title: 'Associate', level: 70, description: 'Generic entry grade for a new joiner with no specific title yet.' },
];

module.exports = { DEPARTMENTS, TEAMS, DESIGNATIONS };
