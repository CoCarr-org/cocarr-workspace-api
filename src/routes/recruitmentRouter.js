const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const ctrl = require('../controllers/recruitmentController');
const offerCtrl = require('../controllers/offerController');

const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

router.get('/', authenticate, requirePermission('recruitment', 'read'), ctrl.list);
router.get('/:id', authenticate, requirePermission('recruitment', 'read'), ctrl.get);
router.post('/', [authenticate, requirePermission('recruitment', 'create'),
  check('firstName').notEmpty().withMessage('firstName is required'),
  check('email').isEmail().withMessage('a valid email is required'),
  validate,
], ctrl.create);
router.put('/:id', authenticate, requirePermission('recruitment', 'update'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('recruitment', 'delete'), ctrl.remove);

// Pipeline actions.
router.post('/:id/advance', [authenticate, requirePermission('recruitment', 'update'),
  check('stage').notEmpty().withMessage('stage is required'),
  validate,
], ctrl.advanceStage);
// The candidate's CV, streamed from private storage. Authenticated, which is
// the entire point of moving résumés off a Drive link shared with ANYONE.
// Declared BEFORE /:id/hire has no bearing, but it must stay above any bare
// '/:id' handler if one is ever added below.
router.get('/:id/resume', authenticate, requirePermission('recruitment', 'read'),
  require('../controllers/careersController').resume);

router.post('/:id/hire', authenticate, requirePermission('recruitment', 'update'), ctrl.hire);

// Stage history (the audit trail behind the single `stage` column).
router.get('/:id/history', authenticate, requirePermission('recruitment', 'read'), ctrl.history);

// Interview rounds — created on demand, any number per candidate.
router.get('/:id/interviews', authenticate, requirePermission('recruitment', 'read'), ctrl.listInterviews);
router.post('/:id/interviews', authenticate, requirePermission('recruitment', 'update'), ctrl.addInterview);
router.put('/:id/interviews/:roundId', authenticate, requirePermission('recruitment', 'update'), ctrl.updateInterview);
router.delete('/:id/interviews/:roundId', authenticate, requirePermission('recruitment', 'update'), ctrl.removeInterview);

// Offers for a candidate (list + create). Offer-level actions live on /offers.
router.get('/:id/offers', authenticate, requirePermission('recruitment', 'read'), ctrl.listOffers);
router.post('/:id/offers', [authenticate, requirePermission('recruitment', 'update'),
  check('expectedJoiningDate').optional(),
  validate,
], offerCtrl.create);

module.exports = router;
