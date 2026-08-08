// Register every model on the sequelize instance BEFORE db.sync runs, and wire
// associations in ONE place (same discipline as cocarr-core-api's index.js).
const db = require('../configs/db');
const Counter = require('./counter');
const Department = require('./department');
const Designation = require('./designation');
const Team = require('./team');
const Employee = require('./employee');
const EmployeeDocument = require('./employeeDocument');
const Candidate = require('./candidate');
const CandidateStageEvent = require('./candidateStageEvent');
const InterviewRound = require('./interviewRound');
const JobOffer = require('./jobOffer');
const JobPosting = require('./jobPosting');
const AccessRequest = require('./accessRequest');

// --- Associations ----------------------------------------------------------
Department.hasMany(Team, { foreignKey: 'departmentId' });
Team.belongsTo(Department, { foreignKey: 'departmentId' });

Department.belongsTo(Department, { as: 'parent', foreignKey: 'parentDepartmentId' });
Department.hasMany(Department, { as: 'children', foreignKey: 'parentDepartmentId' });

Employee.belongsTo(Department, { foreignKey: 'departmentId' });
Employee.belongsTo(Designation, { foreignKey: 'designationId' });
Employee.belongsTo(Team, { foreignKey: 'teamId' });

// Reporting hierarchy (self-referential).
Employee.belongsTo(Employee, { as: 'manager', foreignKey: 'managerId' });
Employee.hasMany(Employee, { as: 'reports', foreignKey: 'managerId' });

Employee.hasMany(EmployeeDocument, { foreignKey: 'employeeId' });
EmployeeDocument.belongsTo(Employee, { foreignKey: 'employeeId' });

Employee.hasMany(AccessRequest, { foreignKey: 'employeeId' });
AccessRequest.belongsTo(Employee, { foreignKey: 'employeeId' });

Candidate.belongsTo(Employee, { as: 'convertedEmployee', foreignKey: 'convertedEmployeeId' });

// A candidate that arrived through the careers site is attached to the role
// they applied for, so the pipeline shows what each application was FOR.
JobPosting.hasMany(Candidate, { foreignKey: 'jobPostingId' });
Candidate.belongsTo(JobPosting, { foreignKey: 'jobPostingId' });

// Pipeline history, interview rounds and offers all hang off the candidate.
Candidate.hasMany(CandidateStageEvent, { as: 'stageEvents', foreignKey: 'candidateId' });
CandidateStageEvent.belongsTo(Candidate, { foreignKey: 'candidateId' });

Candidate.hasMany(InterviewRound, { as: 'interviews', foreignKey: 'candidateId' });
InterviewRound.belongsTo(Candidate, { foreignKey: 'candidateId' });

Candidate.hasMany(JobOffer, { as: 'offers', foreignKey: 'candidateId' });
JobOffer.belongsTo(Candidate, { foreignKey: 'candidateId' });
JobOffer.belongsTo(JobPosting, { foreignKey: 'jobPostingId' });

module.exports = {
  db,
  Counter,
  Department,
  Designation,
  Team,
  Employee,
  EmployeeDocument,
  Candidate,
  CandidateStageEvent,
  InterviewRound,
  JobOffer,
  JobPosting,
  AccessRequest,
};
