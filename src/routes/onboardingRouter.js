const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/onboardingController');

const router = express.Router();

// Onboarding is keyed by employee id.
router.get('/:id', ctrl.get);
router.post('/:id/advance', authenticate, ctrl.advance);
router.post('/:id/approve', authenticate, ctrl.approve);

module.exports = router;
