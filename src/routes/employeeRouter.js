const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const ctrl = require('../controllers/employeeController');

const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

// Static/segment routes BEFORE '/:id' so they aren't captured as an id.
router.get('/', authenticate, requirePermission('employees', 'read'), ctrl.list);
router.get('/org/tree', authenticate, requirePermission('employees', 'read'), ctrl.orgTree);

router.post('/', [authenticate, requirePermission('employees', 'create'),
  check('firstName').notEmpty().withMessage('firstName is required'),
  check('email').isEmail().withMessage('a valid email is required'),
  validate,
], ctrl.create);

router.get('/:id', authenticate, requirePermission('employees', 'read'), ctrl.get);
router.put('/:id', authenticate, requirePermission('employees', 'update'), ctrl.update);
router.post('/:id/status', [authenticate, requirePermission('employees', 'update'),
  check('status').notEmpty().withMessage('status is required'),
  validate,
], ctrl.setStatus);
router.get('/:id/reports', authenticate, requirePermission('employees', 'read'), ctrl.reports);

// Employee documents (onboarding paperwork).
router.get('/:id/documents', authenticate, requirePermission('employees', 'read'), ctrl.listDocuments);
router.post('/:id/documents', authenticate, requirePermission('employees', 'update'), ctrl.addDocument);
router.put('/:id/documents/:docId/status', [authenticate, requirePermission('employees', 'update'),
  check('status').notEmpty().withMessage('status is required'),
  validate,
], ctrl.setDocumentStatus);

module.exports = router;
