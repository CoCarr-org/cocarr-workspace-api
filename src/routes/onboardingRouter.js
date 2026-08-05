const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const ctrl = require('../controllers/onboardingController');

const router = express.Router();

// Onboarding is keyed by employee id.
router.get('/:id', authenticate, requirePermission('employees', 'read'), ctrl.get);
router.post('/:id/advance', authenticate, requirePermission('employees', 'update'), ctrl.advance);
router.post('/:id/approve', authenticate, requirePermission('employees', 'update'), ctrl.approve);

module.exports = router;
