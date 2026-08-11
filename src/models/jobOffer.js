const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// A job offer extended to a candidate.
//
// ARCHITECTED FOR A FUTURE CANDIDATE-FACING FLOW. Today HR sends the offer and
// records the candidate's answer on their behalf (`responseChannel = 'hr_recorded'`).
// The intended next step is a candidate portal on the careers site where the
// applicant logs in, sees their progress, and clicks Accept/Reject on an emailed
// link. Nothing here needs to change for that: `responseToken` is the unguessable
// handle such a link would carry, `respondedBy` records WHO answered (an HR user
// now, the candidate later), and `responseChannel` records HOW. The accept/reject
// logic lives in offerService.respond(), so a future public
// `POST /careers/offers/:token/respond` is a second CALLER of the same function,
// not a reimplementation of the rules.
const JobOffer = db.define('jobOffer', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  candidateId: { type: DataTypes.STRING, allowNull: false },
  jobPostingId: { type: DataTypes.STRING, allowNull: true },

  // The offer terms. designationTitle is stored as text alongside the optional
  // FK because an offer is a record of what was offered on the day — it must not
  // change because a designation was later renamed.
  designationId: { type: DataTypes.STRING, allowNull: true },
  designationTitle: { type: DataTypes.STRING, allowNull: true },
  ctcAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  ctcCurrency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'INR' },
  expectedJoiningDate: { type: DataTypes.DATEONLY, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },

  // Optional uploaded offer-letter (PDF/Word) in the private bucket under the
  // `offer/` prefix — never a public URL, same discipline as résumés.
  letterKey: { type: DataTypes.STRING, allowNull: true },

  status: {
    type: DataTypes.ENUM('draft', 'sent', 'accepted', 'rejected', 'withdrawn', 'expired'),
    allowNull: false,
    defaultValue: 'draft',
  },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  respondedAt: { type: DataTypes.DATE, allowNull: true },
  respondedBy: { type: DataTypes.STRING, allowNull: true },
  responseChannel: {
    type: DataTypes.ENUM('hr_recorded', 'candidate_portal'),
    allowNull: true,
  },
  responseNote: { type: DataTypes.TEXT, allowNull: true },
  // Future emailed-link handle. Unguessable, unique, and null until a
  // candidate-facing link is minted — issuing it is all a self-serve flow adds.
  responseToken: { type: DataTypes.STRING, allowNull: true, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
}, {
  indexes: [{ fields: ['candidateId'] }, { fields: ['status'] }],
});

module.exports = JobOffer;
