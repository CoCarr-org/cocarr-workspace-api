const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const ctrl = require('../controllers/accessRequestController');

const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

router.get('/', authenticate, requirePermission('accessRequests', 'read'), ctrl.list);
router.get('/:id', authenticate, requirePermission('accessRequests', 'read'), ctrl.get);
router.post('/', [authenticate, requirePermission('accessRequests', 'create'),
  check('employeeId').notEmpty().withMessage('employeeId is required'),
  check('target').notEmpty().withMessage('target (requested scope) is required'),
  validate,
], ctrl.create);
router.post('/:id/decide', [authenticate, requirePermission('accessRequests', 'update'),
  check('status').notEmpty().withMessage('status is required'),
  validate,
], ctrl.decide);

router.post('/:id/apply', authenticate, requirePermission('accessRequests', 'update'), ctrl.apply);

module.exports = router;
