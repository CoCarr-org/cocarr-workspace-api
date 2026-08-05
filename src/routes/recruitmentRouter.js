const express = require('express');
const { check } = require('express-validator');
const { assertValid } = require('../utils/validate');
const { authenticate } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/recruitmentController');

const router = express.Router();
const validate = (req, res, next) => { try { assertValid(req); next(); } catch (e) { next(e); } };

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', [
  authenticate,
  check('firstName').notEmpty().withMessage('firstName is required'),
  check('email').isEmail().withMessage('a valid email is required'),
  validate,
], ctrl.create);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.remove);

// Pipeline actions.
router.post('/:id/advance', [
  authenticate,
  check('stage').notEmpty().withMessage('stage is required'),
  validate,
], ctrl.advanceStage);
router.post('/:id/hire', authenticate, ctrl.hire);

module.exports = router;
