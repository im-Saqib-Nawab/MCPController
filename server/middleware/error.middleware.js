import { logError } from '../lib/request-context.js';
import { logAuditFailure } from '../lib/audit-log.js';
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

  const actor =
    req.user ||
    (req.auth?.extra?.userId
      ? {
          _id: req.auth.extra.userId,
          name: req.auth.extra.actorName,
          role: req.auth.extra.role
        }
      : null);

  if (req.auditAction && actor) {
    logAuditFailure(actor, req.auditAction, err, {
      method: req.method,
      route: req.path,
      statusCode: status,
      errorCode: code,
      clientId: req.auth?.clientId
    });
  } else {
    logError(err, {
      operation: 'http.error',
      method: req.method,
      route: req.path,
      statusCode: status,
      errorCode: code,
      userId: req.user?._id ? String(req.user._id) : req.auth?.extra?.userId,
      actorName: req.user?.name || req.auth?.extra?.actorName,
      role: req.user?.role || req.auth?.extra?.role,
      clientId: req.auth?.clientId
    });
  }

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
