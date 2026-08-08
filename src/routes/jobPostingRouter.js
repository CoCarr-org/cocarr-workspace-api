const express = require('express');
const { check } = require('express-validator');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { assertValid } = require('../utils/validate');
const ctrl = require('../controllers/jobPostingController');

const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

// Managing what the public careers site advertises. Authenticated, and gated on
// the SAME `recruitment` module as the candidate pipeline — publishing a role
// and moving applicants through it are one job, done by one team.
const router = express.Router();

router.get('/', authenticate, requirePermission('recruitment', 'read'), ctrl.list);
router.get('/:id', authenticate, requirePermission('recruitment', 'read'), ctrl.get);

router.post('/', [
  authenticate, requirePermission('recruitment', 'create'),
  check('title').trim().notEmpty().withMessage('title is required'),
  validate,
], ctrl.create);

router.put('/:id', authenticate, requirePermission('recruitment', 'update'), ctrl.update);
router.delete('/:id', authenticate, requirePermission('recruitment', 'delete'), ctrl.remove);

// Publish / close, kept explicit rather than a status field on the generic
// update: taking a live advert down is a decision, not an edit, and it is the
// one people look for a button to do.
router.post('/:id/status', [
  authenticate, requirePermission('recruitment', 'update'),
  check('status').isIn(['draft', 'published', 'closed'])
    .withMessage('status must be draft, published or closed'),
  validate,
], ctrl.setStatus);

// Approval workflow. Submitting is part of authoring the post (`update`);
// approving/rejecting is a governance action gated on its own `approve`
// permission, so "who can post" and "who can approve a post" are grantable
// separately (separation of duties). The `approve` action is seeded in
// cocarr-authorization-service alongside the recruitment module.
router.post('/:id/submit', authenticate, requirePermission('recruitment', 'update'), ctrl.submitForApproval);
router.post('/:id/approve', authenticate, requirePermission('recruitment', 'approve'), ctrl.approve);
router.post('/:id/reject', authenticate, requirePermission('recruitment', 'approve'), ctrl.reject);

module.exports = router;
