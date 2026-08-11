const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const ctrl = require('../controllers/careersController');

const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

// THE PUBLIC CAREERS API. Every route here is deliberately UNAUTHENTICATED —
// applicants are members of the public and have no account, by definition.
//
// That makes this the only unauthenticated surface in the workspace service, so
// it is mounted on its own prefix (`/careers`) rather than scattered among the
// authenticated routers. One prefix is something the gateway can allow through
// precisely; endpoints sprinkled across `/candidates` and `/employees` would
// force either a per-path allowlist that drifts or a broad exception that opens
// more than intended.
//
// Nothing here reads or returns an internal record. Postings are filtered to
// `published` with an explicit attribute list, and the application POST answers
// with an id and nothing else.
const router = express.Router();

router.get('/jobs', ctrl.listJobs);
router.get('/jobs/:idOrSlug', ctrl.getJob);

router.post(
  '/applications',
  [
    check('jobId').notEmpty().withMessage('jobId is required'),
    check('name').trim().notEmpty().withMessage('name is required'),
    check('email').isEmail().withMessage('a valid email is required'),
    // Everything else is optional: demanding a phone number or a LinkedIn URL
    // loses real applicants for data nobody acts on at this stage.
    validate,
  ],
  ctrl.apply,
);

module.exports = router;
