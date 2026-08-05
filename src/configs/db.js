const { Sequelize } = require('sequelize');
const Logger = require('../helper/logger');

// Workspace database (MySQL). Mirrors cocarr-core-api's db config so the two
// services share the same operational shape. Connection details come from the
// standard DB_* env vars; see .env.example.
const db = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

db.authenticate()
  .then(() => Logger.info('Workspace DB connection established.'))
  .catch((err) => Logger.error(`Unable to connect to the workspace DB: ${err}`));

module.exports = db;
