// Same error contract as cocarr-core-api so clients see one shape platform-wide.
class CustomError extends Error {
  constructor(message, status = 500, errorCode = null) {
    super(message);
    this.name = message;
    this.status = status;
    this.errorCode = errorCode;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandlerMiddleware(err, req, res, next) {
  const status = err.status || 500;
  const errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An error occurred while processing your request.';
  if (status >= 500) require('../helper/logger').error(`${errorCode}: ${message}`);
  res.status(status).json({ error: { code: errorCode, message } });
}

module.exports = { errorHandlerMiddleware, CustomError };
