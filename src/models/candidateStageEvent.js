const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// One row per pipeline transition — the audit trail behind the candidate's
// single `stage` column. Without it a rejection is just a current state with no
// record of when it happened, who moved it, or where the candidate was before;
// with it the application detail can show a real history instead of a snapshot.
//
// It is written by recruitmentService.advanceStage inside the same flow that
// updates the candidate, so the column and its history cannot disagree.
const CandidateStageEvent = db.define('candidateStageEvent', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  candidateId: { type: DataTypes.STRING, allowNull: false },
  fromStage: { type: DataTypes.STRING, allowNull: true },
  toStage: { type: DataTypes.STRING, allowNull: false },
  // The principal who made the move (identity id / uid). Null for a system move
  // such as an accepted offer flipping the candidate to `hired`.
  byUserId: { type: DataTypes.STRING, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
}, {
  indexes: [{ fields: ['candidateId'] }],
});

module.exports = CandidateStageEvent;
