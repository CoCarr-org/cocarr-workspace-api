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
  stage: {
    type: DataTypes.ENUM('applied', 'screening', 'interview', 'offer', 'hired', 'rejected'),
    allowNull: false,
    defaultValue: 'applied',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
  convertedEmployeeId: { type: DataTypes.STRING, allowNull: true },
}, {
  indexes: [{ fields: ['stage'] }, { fields: ['email'] }],
});

module.exports = Candidate;
