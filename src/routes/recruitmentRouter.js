const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const ctrl = require('../controllers/recruitmentController');

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
router.post('/:id/hire', authenticate, requirePermission('recruitment', 'update'), ctrl.hire);

module.exports = router;
