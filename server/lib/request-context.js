import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { logger, serializeError } from './logger.js';
import { persistLogEntry } from '../services/log-store.service.js';

const storage = new AsyncLocalStorage();

export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

export function getRequestContext() {
  return storage.getStore();
}

export function createRequestContext(req) {
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  const childLogger = logger.child({ requestId });

  return {
    requestId,
    log: childLogger,
    method: req.method,
    path: req.path,
    startTime: Date.now()
  };
}

export function logOperation(level, operation, fields = {}) {
  const ctx = getRequestContext();
  const log = ctx?.log || logger;

  log[level](
    {
      operation,
      method: ctx?.method,
      route: ctx?.path,
      ...fields
    },
    operation
  );

  void persistLogEntry({
    level,
    operation,
    message: operation,
    fields: {
      method: ctx?.method,
      route: ctx?.path,
      ...fields
    }
  });
}

export function logError(err, fields = {}) {
  const ctx = getRequestContext();
  const log = ctx?.log || logger;

  log.error(
    {
      operation: fields.operation || 'error',
      ...fields,
      err: serializeError(err)
    },
    err?.message || 'Error'
  );

  void persistLogEntry({
    level: 'error',
    operation: fields.operation || 'error',
    message: err?.message || 'Error',
    fields: {
      method: ctx?.method,
      route: ctx?.path,
      ...fields,
      err: serializeError(err)
    }
  });
}
