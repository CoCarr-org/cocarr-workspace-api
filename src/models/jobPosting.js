const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// A job advertised on the public careers site.
//
// This replaces the Google Sheet the Apps Script backend read. The important
// change is not the storage — it is that a posting now lives beside the
// Candidate pipeline it feeds, so an application arrives as a `candidate` row
// already attached to the role it was for, and moves through
// applied → screening → interview → offer → hired without anyone re-keying it.
//
// `slug` is the public identifier. The careers site links to /careers/<slug>,
// and a slug outlives edits to the title, so a link shared in a job board or an
// email does not rot the moment somebody fixes a typo in the heading.
const JobPosting = db.define('jobPosting', {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  title: { type: DataTypes.STRING, allowNull: false },

  // Free text rather than a departmentId FK. The careers site is public and
  // shows a human-facing team name ("Engineering", "City Operations") that need
  // not match the internal org structure — and a posting must not break because
  // a department was renamed or archived internally.
  department: { type: DataTypes.STRING, allowNull: true },
  // Optional link to the real department, for when HR wants the connection.
  departmentId: { type: DataTypes.STRING, allowNull: true },

  location: { type: DataTypes.STRING, allowNull: true },
  employmentType: {
    type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'internship'),
    allowNull: false,
    defaultValue: 'full_time',
  },
  experience: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  responsibilities: { type: DataTypes.TEXT, allowNull: true },
  requirements: { type: DataTypes.TEXT, allowNull: true },

  // PUBLISHED IS THE ONLY THING THE PUBLIC SITE READS.
  //
  // Deliberately separate from a delete: a role that is filled or paused should
  // stop being advertised while keeping every application already attached to
  // it. Deleting the posting to hide it would orphan those candidates.
  status: {
    type: DataTypes.ENUM('draft', 'published', 'closed'),
    allowNull: false,
    defaultValue: 'draft',
  },
  // When set and in the past, the role stops accepting applications even while
  // still listed — the site can then say "closed" rather than 404.
  closesAt: { type: DataTypes.DATE, allowNull: true },
  openings: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, {
  indexes: [{ fields: ['status'] }, { unique: true, fields: ['slug'] }],
});

module.exports = JobPosting;
