const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// A job title / designation. `level` is a numeric seniority rank used for
// display and org ordering (lower = more senior, like a tier).
const Designation = db.define('designation', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  title: { type: DataTypes.STRING, allowNull: false, unique: true },
  level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  description: { type: DataTypes.TEXT, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

module.exports = Designation;
