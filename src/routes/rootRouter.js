const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../docs/openapi');
const { health } = require('../controllers/healthController');

const router = express.Router();

router.get('/health', health);
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

router.use('/departments', require('./departmentRouter'));
router.use('/designations', require('./designationRouter'));
router.use('/teams', require('./teamRouter'));
router.use('/employees', require('./employeeRouter'));
router.use('/candidates', require('./recruitmentRouter'));
router.use('/onboarding', require('./onboardingRouter'));
router.use('/access-requests', require('./accessRequestRouter'));

module.exports = router;
