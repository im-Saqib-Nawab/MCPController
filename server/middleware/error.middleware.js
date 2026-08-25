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
  const status = err.status || 500;
  const code = err.code || 'server_error';
  const isProd = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: code,
    message: status >= 500 && isProd ? 'An unexpected error occurred.' : err.message,
    details: isProd ? undefined : err.details
  });
}
