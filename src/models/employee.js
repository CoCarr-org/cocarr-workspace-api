const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// The employee record — the heart of the workspace domain.
//
// IDENTITY (charter rule): employeeCode (EMP-000001) is the business identity,
// NOT the Firebase UID. firebaseUid is stored SEPARATELY and is only populated
// once a staff login is created at the end of onboarding. It is nullable so an
// employee can exist (in onboarding) before any login exists.
//
// STATUS is the employment state; onboardingStage tracks progress through the
// onboarding workflow while status is still 'onboarding'.
const Employee = db.define('employee', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  employeeCode: { type: DataTypes.STRING, allowNull: true, unique: true },
  firebaseUid: { type: DataTypes.STRING, allowNull: true, unique: true },

  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  phone: { type: DataTypes.STRING, allowNull: true },

  departmentId: { type: DataTypes.STRING, allowNull: true },
  designationId: { type: DataTypes.STRING, allowNull: true },
  teamId: { type: DataTypes.STRING, allowNull: true },
  managerId: { type: DataTypes.STRING, allowNull: true }, // self-ref: reporting hierarchy

  status: {
    type: DataTypes.ENUM('onboarding', 'active', 'suspended', 'terminated'),
    allowNull: false,
    defaultValue: 'onboarding',
  },
  onboardingStage: {
    type: DataTypes.ENUM('profile', 'documents', 'review', 'approved'),
    allowNull: false,
    defaultValue: 'profile',
  },

  dateOfJoining: { type: DataTypes.DATEONLY, allowNull: true },
  candidateId: { type: DataTypes.STRING, allowNull: true }, // provenance: hired candidate
}, {
  indexes: [{ fields: ['status'] }, { fields: ['departmentId'] }, { fields: ['managerId'] }],
});

module.exports = Employee;
