const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// An interview round attached to a candidate. Rounds are created ON DEMAND —
// a process can have one round or five, so they are rows here rather than fixed
// stages on the candidate. The candidate sits at the `interview` stage while any
// round is outstanding; the recruiter adds the next round when the previous one
// passes, and moves the candidate to `selected`/`rejected` when they are done.
const InterviewRound = db.define('interviewRound', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  candidateId: { type: DataTypes.STRING, allowNull: false },
  // 1-based sequence within the candidate's process, for display order.
  roundNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  title: { type: DataTypes.STRING, allowNull: true }, // e.g. "Technical round", "HR round"
  mode: {
    type: DataTypes.ENUM('onsite', 'online', 'phone'),
    allowNull: false,
    defaultValue: 'online',
  },
  scheduledAt: { type: DataTypes.DATE, allowNull: true },
  interviewerName: { type: DataTypes.STRING, allowNull: true },
  interviewerUserId: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM('scheduled', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'scheduled',
  },
  // The interviewer's verdict, separate from whether the round happened.
  result: {
    type: DataTypes.ENUM('pending', 'pass', 'fail', 'hold'),
    allowNull: false,
    defaultValue: 'pending',
  },
  feedback: { type: DataTypes.TEXT, allowNull: true },
}, {
  indexes: [{ fields: ['candidateId'] }],
});

module.exports = InterviewRound;
