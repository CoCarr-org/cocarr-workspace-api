const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/accessRequestController');

const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', [
  authenticate,
  check('employeeId').notEmpty().withMessage('employeeId is required'),
  check('target').notEmpty().withMessage('target (requested scope) is required'),
  validate,
], ctrl.create);
router.post('/:id/decide', [
  authenticate,
  check('status').notEmpty().withMessage('status is required'),
  validate,
], ctrl.decide);

module.exports = router;
