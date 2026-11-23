export function errorHandler({ logger, config }) {
  return function handleError(err, req, res, next) {
    if (res.headersSent) {
      return next(err);
    }

    const status = Number.isInteger(err.status) ? err.status : 500;
    const isServerError = status >= 500;
    const code = isServerError
      ? 'INTERNAL_ERROR'
      : typeof err.code === 'string'
        ? err.code
        : 'REQUEST_ERROR';
    const message = isServerError
      ? 'Internal server error'
      : err.message || 'Request failed';

    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status,
      error: err.message,
    };

    if (config.NODE_ENV === 'development' && err.stack) {
      meta.stack = err.stack;
    }

    logger.error('Request failed', meta);

    res.status(status).json({
      error: {
        code,
        message,
        requestId: req.id,
      },
    });
  };
}
