require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// winston's File transport needs the directory to exist.
fs.mkdirSync('logs', { recursive: true });

const Logger = require('./src/helper/logger');
// Register every model + association BEFORE db.sync (same discipline as core-api).
const { db } = require('./src/models');
const rootRouter = require('./src/routes/rootRouter');
const { errorHandlerMiddleware } = require('./src/middlewares/error');

const app = express();

// CORS allowlist (comma-separated). Unset = allow all with a warning.
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);
if (CORS_ORIGINS.length === 0) {
  console.warn('[cors] CORS_ORIGINS not set — allowing every origin. Set it in production.');
  app.use(cors({ origin: '*' }));
} else {
  app.use(cors({
    origin: (origin, cb) => (!origin || CORS_ORIGINS.includes(origin)
      ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
    credentials: true,
  }));
}

app.use(bodyParser.json({ limit: '12mb' }));
app.use(bodyParser.urlencoded({ limit: '12mb', extended: true }));

app.use('/v1', rootRouter);
app.use(errorHandlerMiddleware);

const PORT = process.env.PORT || 3040;

// Sync the schema, then listen. If sync fails (e.g. DB not reachable at boot) we
// still listen so /v1/health can report the degraded state rather than the whole
// process being unreachable.
db.sync({ alter: true })
  .then(() => Logger.info('Workspace schema synced.'))
  .catch((err) => Logger.error(`Schema sync failed: ${err.message}`))
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => Logger.info(`cocarr-workspace-api listening on ${PORT}`));
  });
