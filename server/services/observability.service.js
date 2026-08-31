import mongoose from 'mongoose';

import { config } from '../config/env.js';
import { getLogById, searchLogs } from './log-store.service.js';

const APP_STARTED_AT = Date.now();

let SystemLogModel;

async function getModel() {
  if (!SystemLogModel) {
    ({ SystemLog: SystemLogModel } = await import('../models/SystemLog.js'));
  }
  return SystemLogModel;
}

function sinceDate(filters = {}) {
  if (filters.sinceMinutes) {
    const since = Number(filters.sinceMinutes);
    if (Number.isFinite(since) && since > 0) {
      return new Date(Date.now() - since * 60 * 1000);
    }
  }

  if (filters.since) {
    const since = new Date(filters.since);
    if (!Number.isNaN(since.getTime())) {
      return since;
    }
  }

  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function actorFromUser(user) {
  return {
    _id: user._id,
    role: user.role
  };
}

export async function listLogs(user, filters = {}) {
  return searchLogs(actorFromUser(user), filters);
}

export async function fetchLog(user, logId) {
  return getLogById(actorFromUser(user), logId);
}

export async function listTraces(user, filters = {}) {
  const SystemLog = await getModel();
  const since = sinceDate(filters);
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

  const match = {
    requestId: { $exists: true, $nin: [null, ''] },
    createdAt: { $gte: since }
  };

  if (filters.status === 'error') {
    match.level = 'error';
  }

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      match.$or = [
        { requestId: term },
        { route: { $regex: term, $options: 'i' } },
        { operation: { $regex: term, $options: 'i' } },
        { tool: { $regex: term, $options: 'i' } }
      ];
    }
  }

  const traces = await SystemLog.aggregate([
    { $match: match },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$requestId',
        startTime: { $first: '$createdAt' },
        endTime: { $last: '$createdAt' },
        durationMs: { $max: '$durationMs' },
        method: { $first: '$method' },
        route: { $first: '$route' },
        userId: { $first: '$userId' },
        role: { $first: '$role' },
        tool: { $first: '$tool' },
        statusCode: { $max: '$statusCode' },
        hasError: {
          $max: {
            $cond: [{ $in: ['$level', ['error', 'warn']] }, 1, 0]
          }
        },
        errorMessage: {
          $last: {
            $cond: [{ $eq: ['$level', 'error'] }, '$errorMessage', null]
          }
        },
        stepCount: { $sum: 1 },
        operations: {
          $push: {
            time: '$createdAt',
            operation: '$operation',
            level: '$level',
            message: '$message',
            tool: '$tool',
            durationMs: '$durationMs'
          }
        }
      }
    },
    {
      $addFields: {
        status: {
          $cond: [
            {
              $or: [{ $eq: ['$hasError', 1] }, { $gte: ['$statusCode', 400] }]
            },
            'error',
            'success'
          ]
        },
        action: {
          $cond: [
            { $ifNull: ['$tool', false] },
            { $concat: ['MCP ', '$tool'] },
            { $concat: [{ $ifNull: ['$method', ''] }, ' ', { $ifNull: ['$route', ''] }] }
          ]
        }
      }
    },
    ...(filters.status === 'success' ? [{ $match: { status: 'success' } }] : []),
    ...(filters.status === 'error' ? [{ $match: { status: 'error' } }] : []),
    { $sort: { startTime: -1 } },
    { $limit: limit }
  ]);

  return traces.map((trace) => ({
    traceId: trace._id,
    timestamp: trace.startTime,
    endTime: trace.endTime,
    action: String(trace.action || '').trim(),
    userId: trace.userId,
    role: trace.role,
    tool: trace.tool,
    method: trace.method,
    route: trace.route,
    durationMs: trace.durationMs || null,
    status: trace.status,
    statusCode: trace.statusCode || null,
    errorMessage: trace.errorMessage || null,
    stepCount: trace.stepCount,
    steps: trace.operations
  }));
}

export async function getTrace(user, requestId) {
  const logs = await searchLogs(actorFromUser(user), {
    requestId,
    limit: 200
  });

  if (!logs.length) {
    return null;
  }

  const hasError = logs.some((log) => log.level === 'error' || (log.statusCode && log.statusCode >= 400));
  const durationMs = logs.reduce((max, log) => Math.max(max, log.durationMs || 0), 0);
  const first = logs[0];
  const last = logs[logs.length - 1];

  return {
    traceId: requestId,
    timestamp: first.time,
    endTime: last.time,
    action: first.tool ? `MCP ${first.tool}` : `${first.method || ''} ${first.route || ''}`.trim(),
    userId: first.userId,
    role: first.role,
    tool: first.tool,
    method: first.method,
    route: first.route,
    durationMs: durationMs || null,
    status: hasError ? 'error' : 'success',
    errorMessage: logs.find((log) => log.errorMessage)?.errorMessage || null,
    steps: logs.map((log) => ({
      time: log.time,
      level: log.level,
      operation: log.operation,
      message: log.message,
      tool: log.tool,
      durationMs: log.durationMs,
      statusCode: log.statusCode,
      errorMessage: log.errorMessage
    }))
  };
}

export async function getMetrics(_user, filters = {}) {
  const SystemLog = await getModel();
  const since = sinceDate(filters);

  const [
    httpCompleted,
    httpErrors,
    mcpTools,
    dbOps,
    levelCounts,
    recentErrors
  ] = await Promise.all([
    SystemLog.countDocuments({
      operation: 'http.request.completed',
      createdAt: { $gte: since }
    }),
    SystemLog.countDocuments({
      operation: 'http.request.completed',
      createdAt: { $gte: since },
      $or: [{ level: 'error' }, { statusCode: { $gte: 400 } }]
    }),
    SystemLog.aggregate([
      {
        $match: {
          operation: { $in: ['mcp.tool.completed', 'mcp.tool.failed', 'mcp.tool.started'] },
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$tool',
          calls: { $sum: 1 },
          failures: {
            $sum: {
              $cond: [{ $eq: ['$operation', 'mcp.tool.failed'] }, 1, 0]
            }
          },
          avgDurationMs: { $avg: '$durationMs' }
        }
      },
      { $sort: { calls: -1 } },
      { $limit: 10 }
    ]),
    SystemLog.countDocuments({
      operation: { $regex: /^db\./ },
      createdAt: { $gte: since }
    }),
    SystemLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$level', count: { $sum: 1 } } }
    ]),
    SystemLog.find({
      level: 'error',
      createdAt: { $gte: since }
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);

  const avgDuration = await SystemLog.aggregate([
    {
      $match: {
        operation: 'http.request.completed',
        createdAt: { $gte: since },
        durationMs: { $type: 'number' }
      }
    },
    {
      $group: {
        _id: null,
        avgDurationMs: { $avg: '$durationMs' }
      }
    }
  ]);

  const mcpToolCalls = await SystemLog.countDocuments({
    operation: 'mcp.tool.started',
    createdAt: { $gte: since }
  });

  const successfulRequests = httpCompleted - httpErrors;
  const errorRate = httpCompleted ? Number(((httpErrors / httpCompleted) * 100).toFixed(1)) : 0;
  const uptimeMs = Date.now() - APP_STARTED_AT;
  const dbConnected = mongoose.connection.readyState === 1;

  return {
    window: {
      since,
      until: new Date()
    },
    requests: {
      total: httpCompleted,
      successful: successfulRequests,
      failed: httpErrors,
      errorRate
    },
    responseTime: {
      averageMs: Math.round(avgDuration[0]?.avgDurationMs || 0)
    },
    mcp: {
      toolCalls: mcpToolCalls,
      topTools: mcpTools.map((row) => ({
        tool: row._id || 'unknown',
        calls: row.calls,
        failures: row.failures,
        avgDurationMs: Math.round(row.avgDurationMs || 0)
      }))
    },
    database: {
      operations: dbOps,
      connected: dbConnected,
      state: dbConnected ? 'connected' : 'disconnected'
    },
    logs: {
      byLevel: Object.fromEntries(levelCounts.map((row) => [row._id, row.count]))
    },
    health: {
      ok: dbConnected,
      uptimeMs,
      uptimeHuman: formatDuration(uptimeMs),
      environment: config.nodeEnv
    },
    recentErrors: recentErrors.map((log) => ({
      id: String(log._id),
      time: log.createdAt,
      operation: log.operation,
      message: log.errorMessage || log.message,
      requestId: log.requestId
    }))
  };
}

export async function getOverview(user, filters = {}) {
  const [metrics, logs, traces] = await Promise.all([
    getMetrics(user, filters),
    listLogs(user, { ...filters, limit: 10 }),
    listTraces(user, { ...filters, limit: 10 })
  ]);

  return { metrics, logs, traces };
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
