const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// A document attached to an employee (offer letter, ID proof, contract, ...).
// fileKey is the object-storage key served through the platform image proxy;
// like the rest of the platform, clients must NOT link the bucket directly.
const EmployeeDocument = db.define('employeeDocument', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  type: {
    type: DataTypes.ENUM('id_proof', 'address_proof', 'offer_letter', 'contract', 'education', 'other'),
    allowNull: false,
    defaultValue: 'other',
  },
  fileKey: { type: DataTypes.STRING, allowNull: true },
  fileName: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'verified', 'rejected'), defaultValue: 'pending' },
  note: { type: DataTypes.STRING, allowNull: true },
}, {
  indexes: [{ fields: ['employeeId'] }],
});

module.exports = EmployeeDocument;
