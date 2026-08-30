import { logError } from '../lib/request-context.js';
import { config } from '../config/env.js';

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

  let status = err.status || 500;
  let code = err.code || 'server_error';
  let message = err.message;

  if (err.name === 'CastError') {
    status = 400;
    code = 'invalid_id';
    message = 'Invalid id.';
  }

  logError(err, {
    operation: 'http.error',
    method: req.method,
    route: req.path,
    statusCode: status,
    errorCode: code,
    userId: req.user?._id ? String(req.user._id) : req.auth?.extra?.userId,
    clientId: req.auth?.clientId
  });

  const body = {
    error: code,
    message: status >= 500 && config.isProduction ? 'An unexpected error occurred.' : message,
    requestId: req.requestId
  };

  if (!config.isProduction && err.details !== undefined) {
    body.details = err.details;
  }

  res.status(status).json(body);
}
