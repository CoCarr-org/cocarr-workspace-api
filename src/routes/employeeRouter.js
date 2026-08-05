const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/employeeController');

const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

// Static/segment routes BEFORE '/:id' so they aren't captured as an id.
router.get('/', ctrl.list);
router.get('/org/tree', ctrl.orgTree);

router.post('/', [
  authenticate,
  check('firstName').notEmpty().withMessage('firstName is required'),
  check('email').isEmail().withMessage('a valid email is required'),
  validate,
], ctrl.create);

router.get('/:id', ctrl.get);
router.put('/:id', [authenticate], ctrl.update);
router.post('/:id/status', [
  authenticate,
  check('status').notEmpty().withMessage('status is required'),
  validate,
], ctrl.setStatus);
router.get('/:id/reports', ctrl.reports);

// Employee documents (onboarding paperwork).
router.get('/:id/documents', ctrl.listDocuments);
router.post('/:id/documents', authenticate, ctrl.addDocument);
router.put('/:id/documents/:docId/status', [
  authenticate,
  check('status').notEmpty().withMessage('status is required'),
  validate,
], ctrl.setDocumentStatus);

module.exports = router;
