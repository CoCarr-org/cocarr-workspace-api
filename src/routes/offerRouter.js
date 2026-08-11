const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const ctrl = require('../controllers/offerController');

// Offer-level actions, keyed by offerId. Offers belong to the recruitment
// domain, so they are gated on the same `recruitment` module. Creating and
// listing offers for a candidate lives on /candidates/:id/offers; this router is
// the lifecycle of an existing offer.
//
// FUTURE: a candidate-facing accept/reject would be a PUBLIC route on the
// careers router (`POST /careers/offers/:token/respond`) calling the same
// offerService.respond — not added here, but the token and channel fields exist
// for it. Nothing on this authenticated router changes when that lands.
const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

router.get('/:offerId', authenticate, requirePermission('recruitment', 'read'), ctrl.get);
router.get('/:offerId/letter', authenticate, requirePermission('recruitment', 'read'), ctrl.letter);

router.put('/:offerId', authenticate, requirePermission('recruitment', 'update'), ctrl.update);
router.post('/:offerId/letter', authenticate, requirePermission('recruitment', 'update'), ctrl.uploadLetter);
router.post('/:offerId/send', authenticate, requirePermission('recruitment', 'update'), ctrl.send);
router.post('/:offerId/respond', [authenticate, requirePermission('recruitment', 'update'),
  check('decision').isIn(['accepted', 'rejected']).withMessage('decision must be accepted or rejected'),
  validate,
], ctrl.respond);
router.post('/:offerId/withdraw', authenticate, requirePermission('recruitment', 'update'), ctrl.withdraw);

module.exports = router;
