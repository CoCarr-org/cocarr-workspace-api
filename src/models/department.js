const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// A department in the organization structure. parentDepartmentId lets
// departments nest (org tree); headEmployeeId points at the employee who leads it.
const Department = db.define('department', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  code: { type: DataTypes.STRING, allowNull: true, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  parentDepartmentId: { type: DataTypes.STRING, allowNull: true },
  headEmployeeId: { type: DataTypes.STRING, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

module.exports = Department;
