export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorMiddleware(err, req, res, next) {
  void next;
  const isProd = process.env.NODE_ENV === 'production';
  let status = err.status || 500;
  let code = err.code || 'server_error';
  let message = err.message;

  if (err.name === 'CastError') {
    status = 400;
    code = 'invalid_id';
    message = 'Invalid id.';
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: code,
    message: status >= 500 && isProd ? 'An unexpected error occurred.' : message,
    details: isProd ? undefined : err.details
  });
}
