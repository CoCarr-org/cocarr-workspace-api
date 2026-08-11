const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// Recruitment: a candidate moving through the hiring pipeline. On 'hired' the
// candidate is converted into an Employee in the 'onboarding' state.
const Candidate = db.define('candidate', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: true },
  positionTitle: { type: DataTypes.STRING, allowNull: true },
  departmentId: { type: DataTypes.STRING, allowNull: true },
  designationId: { type: DataTypes.STRING, allowNull: true },
  source: { type: DataTypes.STRING, allowNull: true },
  resumeKey: { type: DataTypes.STRING, allowNull: true },
  // THE HIRING PIPELINE, in order:
  //   applied → screening → shortlisted → interview → selected → offer → hired
  // plus two exits reachable from ANY stage: `rejected` (we passed) and
  // `withdrawn` (they walked). `interview` can hold any number of rounds — those
  // live on the interviewRound table, not as extra stages, so a two-round and a
  // five-round process share one pipeline. `offer` means an offer is out and the
  // candidate is deciding; `hired` is set only when the offer is accepted, which
  // is also what moves them onto the onboarding list.
  stage: {
    type: DataTypes.ENUM(
      'applied', 'screening', 'shortlisted', 'interview',
      'selected', 'offer', 'hired', 'rejected', 'withdrawn',
    ),
    allowNull: false,
    defaultValue: 'applied',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
  // Set when the application came through the public careers site.
  // Null for a candidate added by hand inside the workspace.
  jobPostingId: { type: DataTypes.STRING, allowNull: true },
  convertedEmployeeId: { type: DataTypes.STRING, allowNull: true },
}, {
  indexes: [{ fields: ['stage'] }, { fields: ['email'] }, { fields: ['jobPostingId'] }],
});

module.exports = Candidate;
