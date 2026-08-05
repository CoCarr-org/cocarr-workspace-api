const { validationResult } = require('express-validator');
const { CustomError } = require('../middlewares/error');

// Turn express-validator failures into the platform's error shape.
function assertValid(req) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const first = result.array()[0];
    throw new CustomError(first.msg, 400, 'VALIDATION_ERROR');
  }
}

module.exports = { assertValid };
