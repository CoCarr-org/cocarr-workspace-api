const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { makeCrudController } = require('../controllers/crudController');
const service = require('../services/designationService');

const router = express.Router();
const ctrl = makeCrudController(service);
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

router.get('/', authenticate, requirePermission('orgStructure', 'read'), ctrl.list);
router.get('/:id', authenticate, requirePermission('orgStructure', 'read'), ctrl.get);
router.post('/', [authenticate, requirePermission('orgStructure', 'create'),
    check('title').notEmpty().withMessage('title is required'),
  validate], ctrl.create);
router.put('/:id', [authenticate, requirePermission('orgStructure', 'update'),
    check('title').notEmpty().withMessage('title is required'),
  validate], ctrl.update);
router.delete('/:id', authenticate, requirePermission('orgStructure', 'delete'), ctrl.remove);

module.exports = router;
