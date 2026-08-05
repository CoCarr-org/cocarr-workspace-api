const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// An employee's request for additional platform access (a product/portal/module
// permission). The APPROVAL is recorded here; the actual IAM change is applied
// by the authorization service / core-api (a workspace record does not itself
// grant access). `target` captures the requested scope as JSON so the model
// doesn't need to know the IAM taxonomy.
const AccessRequest = db.define('accessRequest', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  target: { type: DataTypes.JSON, allowNull: false }, // { product, portal, module, permission }
  reason: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  decidedByUid: { type: DataTypes.STRING, allowNull: true },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
  decisionNote: { type: DataTypes.STRING, allowNull: true },
  iamApplied: { type: DataTypes.BOOLEAN, defaultValue: false }, // did IAM actually get updated?
}, {
  indexes: [{ fields: ['employeeId'] }, { fields: ['status'] }],
});

module.exports = AccessRequest;
