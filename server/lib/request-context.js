import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { logger, serializeError } from './logger.js';
import { shouldPersistToDatabase } from './log-persist.js';
import { enqueueLogEntry } from './log-queue.js';

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
    fields.message || operation
  );

  if (
    !shouldPersistToDatabase({
      level,
      operation,
      fields: {
        method: ctx?.method,
        route: ctx?.path,
        ...fields
      }
    })
  ) {
    return;
  }

  void enqueuePersistedLog({
    level,
    operation,
    message: fields.message || operation,
    fields: {
      method: ctx?.method,
      route: ctx?.path,
      ...fields
    }
  });
}

async function enqueuePersistedLog({ level, operation, message, fields = {} }) {
  const entry = buildLogDocument({ level, operation, message, fields });
  if (!entry) return;
  enqueueLogEntry(entry);
}

function buildLogDocument({ level, operation, message, fields = {} }) {
  const ctx = getRequestContext();
  const metadata = sanitizePersistFields(fields);
  const err = metadata.err;
  delete metadata.err;
  delete metadata.operation;

  return {
    level,
    operation,
    message: message || operation,
    requestId: fields.requestId || ctx?.requestId,
    method: fields.method || ctx?.method,
    route: fields.route || ctx?.path,
    statusCode: fields.statusCode,
    durationMs: fields.durationMs,
    userId: fields.userId,
    actorName: fields.actorName,
    action: fields.action,
    status: fields.status,
    category: fields.category,
    clientId: fields.clientId,
    role: fields.role,
    tool: fields.tool,
    errorCode: fields.errorCode || err?.code,
    errorName: err?.name,
    errorMessage: err?.message,
    errorStack: err?.stack,
    metadata: Object.keys(metadata).length ? metadata : undefined
  };
}

function sanitizePersistFields(fields = {}) {
  const blocked = new Set([
    'password',
    'token',
    'access_token',
    'refresh_token',
    'code',
    'code_verifier',
    'client_secret',
    'authorization',
    'cookie'
  ]);

  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (blocked.has(key)) continue;
    if (key === 'err' && value && typeof value === 'object') {
      clean.err = serializeError(value);
      continue;
    }
    clean[key] = value;
  }
  return clean;
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

  void enqueuePersistedLog({
    level: 'error',
    operation: fields.operation || 'error',
    message: fields.message || err?.message || 'Error',
    fields: {
      method: ctx?.method,
      route: ctx?.path,
      status: fields.status || 'error',
      ...fields,
      err: serializeError(err)
    }
  });
}
