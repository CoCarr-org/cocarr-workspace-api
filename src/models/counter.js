const { DataTypes } = require('sequelize');
const db = require('../configs/db');

// Monotonic counters (e.g. employee-code allocation). One row per key.
const Counter = db.define('counter', {
  key: { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

module.exports = Counter;
