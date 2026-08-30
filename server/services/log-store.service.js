import { config } from '../config/env.js';
import { logger, serializeError } from '../lib/logger.js';
import { getRequestContext } from '../lib/request-context.js';

let SystemLogModel;

async function getModel() {
  if (!SystemLogModel) {
    ({ SystemLog: SystemLogModel } = await import('../models/SystemLog.js'));
  }
  return SystemLogModel;
}

function sanitizeMetadata(fields = {}) {
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

export async function persistLogEntry({ level, operation, message, fields = {} }) {
  if (config.nodeEnv === 'test') {
    return;
  }

  const ctx = getRequestContext();
  const metadata = sanitizeMetadata(fields);
  const err = metadata.err;

  delete metadata.err;
  delete metadata.operation;

  const entry = {
    level,
    operation,
    message: message || operation,
    requestId: fields.requestId || ctx?.requestId,
    method: fields.method || ctx?.method,
    route: fields.route || ctx?.path,
    statusCode: fields.statusCode,
    durationMs: fields.durationMs,
    userId: fields.userId,
    clientId: fields.clientId,
    role: fields.role,
    tool: fields.tool,
    errorCode: fields.errorCode || err?.code,
    errorName: err?.name,
    errorMessage: err?.message,
    errorStack: err?.stack,
    metadata: Object.keys(metadata).length ? metadata : undefined
  };

  try {
    const SystemLog = await getModel();
    await SystemLog.create(entry);
  } catch (persistErr) {
    logger.warn(
      {
        operation: 'log.persist.failed',
        err: serializeError(persistErr)
      },
      'Failed to persist log entry'
    );
  }
}

export async function searchLogs(actor, filters = {}) {
  const SystemLog = await getModel();
  const query = {};

  if (actor.role !== 'admin') {
    query.userId = String(actor._id);
  } else if (filters.userId) {
    query.userId = String(filters.userId);
  }

  if (filters.requestId) {
    query.requestId = String(filters.requestId);
  }

  if (filters.operation) {
    query.operation = String(filters.operation);
  }

  if (filters.level) {
    query.level = String(filters.level);
  }

  if (filters.tool) {
    query.tool = String(filters.tool);
  }

  if (filters.sinceMinutes) {
    const since = Number(filters.sinceMinutes);
    if (Number.isFinite(since) && since > 0) {
      query.createdAt = { $gte: new Date(Date.now() - since * 60 * 1000) };
    }
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

  const sortOrder = filters.requestId && !filters.operation ? 1 : -1;

  const logs = await SystemLog.find(query)
    .sort({ createdAt: sortOrder })
    .limit(limit)
    .lean();

  return logs.map((log) => ({
    id: String(log._id),
    time: log.createdAt,
    level: log.level,
    operation: log.operation,
    message: log.message,
    requestId: log.requestId,
    method: log.method,
    route: log.route,
    statusCode: log.statusCode,
    durationMs: log.durationMs,
    userId: log.userId,
    clientId: log.clientId,
    role: log.role,
    tool: log.tool,
    errorCode: log.errorCode,
    errorMessage: log.errorMessage,
    errorStack: log.errorStack,
    metadata: log.metadata
  }));
}
