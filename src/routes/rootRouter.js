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
router.use('/job-postings', require('./jobPostingRouter'));
// PUBLIC — see careersRouter. Mounted on its own prefix so the gateway can
// allow exactly this through and nothing else.
router.use('/careers', require('./careersRouter'));
router.use('/onboarding', require('./onboardingRouter'));
router.use('/access-requests', require('./accessRequestRouter'));

module.exports = router;
