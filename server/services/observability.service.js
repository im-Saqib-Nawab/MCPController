import mongoose from 'mongoose';

import { config } from '../config/env.js';
import { MCP_ACTION_LABELS } from '../lib/audit-log.js';
import { getLogById, searchLogs } from './log-store.service.js';

const APP_STARTED_AT = Date.now();

const REST_AUDIT_ACTIONS = [
  'Login',
  'Logout',
  'Register',
  'Update Profile',
  'Book Appointment',
  'Cancel Appointment',
  'Accept Appointment',
  'Reject Appointment',
  'Suggest Alternative Date',
  'Accept Alternative Date',
  'Complete Appointment',
  'Admin Update Appointment',
  'Create Doctor',
  'Update Doctor',
  'Delete Doctor',
  'Update Availability',
  'Create Patient',
  'Update Patient',
  'Delete Patient',
  'Update User Permissions',
  'Revoke MCP Connection'
];

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

function traceMatch(filters = {}) {
  const since = sinceDate(filters);
  const match = {
    requestId: { $exists: true, $nin: [null, ''] },
    createdAt: { $gte: since }
  };

  if (filters.includeTechnical !== true) {
    match.category = 'audit';
  }

  if (filters.userId) {
    match.userId = String(filters.userId);
  }

  if (filters.role) {
    match.role = String(filters.role);
  }

  if (filters.action) {
    match.action = String(filters.action);
  }

  if (filters.status) {
    match.status = String(filters.status);
  }

  if (filters.actorName) {
    match.actorName = { $regex: String(filters.actorName).trim(), $options: 'i' };
  }

  if (filters.minDurationMs) {
    match.durationMs = { $gte: Number(filters.minDurationMs) };
  }

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      match.$or = [
        { requestId: term },
        { action: { $regex: term, $options: 'i' } },
        { actorName: { $regex: term, $options: 'i' } },
        { message: { $regex: term, $options: 'i' } },
        { tool: { $regex: term, $options: 'i' } },
        { route: { $regex: term, $options: 'i' } }
      ];
    }
  }

  return match;
}

export async function listLogs(user, filters = {}) {
  return searchLogs(actorFromUser(user), filters);
}

export async function fetchLog(user, logId) {
  return getLogById(actorFromUser(user), logId);
}

export async function listTraces(user, filters = {}) {
  const SystemLog = await getModel();
  const match = traceMatch(filters);
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

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
        actorName: { $first: '$actorName' },
        role: { $first: '$role' },
        action: { $first: '$action' },
        tool: { $first: '$tool' },
        statusCode: { $max: '$statusCode' },
        status: { $last: '$status' },
        message: { $last: '$message' },
        hasError: {
          $max: {
            $cond: [{ $eq: ['$status', 'error'] }, 1, 0]
          }
        },
        errorMessage: {
          $last: {
            $cond: [{ $eq: ['$status', 'error'] }, '$errorMessage', null]
          }
        },
        stepCount: { $sum: 1 },
        operations: {
          $push: {
            time: '$createdAt',
            operation: '$operation',
            action: '$action',
            level: '$level',
            message: '$message',
            actorName: '$actorName',
            role: '$role',
            tool: '$tool',
            status: '$status',
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
              $or: [{ $eq: ['$hasError', 1] }, { $eq: ['$status', 'error'] }, { $gte: ['$statusCode', 400] }]
            },
            'error',
            'success'
          ]
        },
        action: {
          $ifNull: [
            '$action',
            {
              $cond: [
                { $ifNull: ['$tool', false] },
                { $concat: ['MCP ', '$tool'] },
                { $concat: [{ $ifNull: ['$method', ''] }, ' ', { $ifNull: ['$route', ''] }] }
              ]
            }
          ]
        }
      }
    },
    ...(filters.status ? [{ $match: { status: String(filters.status) } }] : []),
    ...(filters.minDurationMs ? [{ $match: { durationMs: { $gte: Number(filters.minDurationMs) } } }] : []),
    { $sort: { startTime: -1 } },
    { $limit: limit }
  ]);

  return traces.map((trace) => ({
    traceId: trace._id,
    timestamp: trace.startTime,
    endTime: trace.endTime,
    action: trace.action || 'Unknown action',
    actorName: trace.actorName,
    userId: trace.userId,
    role: trace.role,
    tool: trace.tool,
    method: trace.method,
    route: trace.route,
    durationMs: trace.durationMs || null,
    status: trace.status,
    statusCode: trace.statusCode || null,
    message: trace.message,
    errorMessage: trace.errorMessage || null,
    stepCount: trace.stepCount,
    steps: trace.operations
  }));
}

export async function getTrace(user, requestId) {
  const logs = await searchLogs(actorFromUser(user), {
    requestId,
    limit: 200,
    includeTechnical: true,
    auditOnly: false
  });

  if (!logs.length) {
    return null;
  }

  const auditLog = logs.find((log) => log.category === 'audit') || logs[logs.length - 1];
  const hasError = logs.some((log) => log.status === 'error' || log.level === 'error' || (log.statusCode && log.statusCode >= 400));
  const durationMs = logs.reduce((max, log) => Math.max(max, log.durationMs || 0), 0);

  return {
    traceId: requestId,
    timestamp: logs[0].time,
    endTime: logs[logs.length - 1].time,
    action: auditLog.action || auditLog.summary,
    actorName: auditLog.actorName,
    userId: auditLog.userId,
    role: auditLog.role,
    tool: auditLog.tool,
    method: auditLog.method,
    route: auditLog.route,
    durationMs: durationMs || null,
    status: hasError ? 'error' : auditLog.status || 'success',
    message: auditLog.message,
    errorMessage: logs.find((log) => log.errorMessage)?.errorMessage || null,
    steps: logs.map((log) => ({
      id: log.id,
      time: log.time,
      level: log.level,
      operation: log.operation,
      action: log.action,
      message: log.message,
      actorName: log.actorName,
      role: log.role,
      tool: log.tool,
      status: log.status,
      durationMs: log.durationMs,
      statusCode: log.statusCode,
      errorMessage: log.errorMessage,
      requestId: log.requestId
    }))
  };
}

export async function getMetrics(_user, filters = {}) {
  const SystemLog = await getModel();
  const since = sinceDate(filters);

  const auditMatch = { category: 'audit', createdAt: { $gte: since } };

  const [
    auditTotal,
    auditSuccess,
    auditFailed,
    auditByAction,
    auditByRole,
    httpCompleted,
    httpErrors,
    mcpTools,
    dbOps,
    recentAuditErrors
  ] = await Promise.all([
    SystemLog.countDocuments(auditMatch),
    SystemLog.countDocuments({ ...auditMatch, status: 'success' }),
    SystemLog.countDocuments({ ...auditMatch, status: 'error' }),
    SystemLog.aggregate([
      { $match: auditMatch },
      { $group: { _id: '$action', count: { $sum: 1 }, failures: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    SystemLog.aggregate([
      { $match: auditMatch },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
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
          category: 'audit',
          tool: { $exists: true, $nin: [null, ''] },
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$tool',
          calls: { $sum: 1 },
          failures: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
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
    SystemLog.find({ ...auditMatch, status: 'error' })
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
    { $group: { _id: null, avgDurationMs: { $avg: '$durationMs' } } }
  ]);

  const auditAvgDuration = await SystemLog.aggregate([
    {
      $match: {
        ...auditMatch,
        durationMs: { $type: 'number' }
      }
    },
    { $group: { _id: null, avgDurationMs: { $avg: '$durationMs' } } }
  ]);

  const uptimeMs = Date.now() - APP_STARTED_AT;
  const dbConnected = mongoose.connection.readyState === 1;
  const errorRate = auditTotal ? Number(((auditFailed / auditTotal) * 100).toFixed(1)) : 0;

  return {
    window: { since, until: new Date() },
    audit: {
      total: auditTotal,
      successful: auditSuccess,
      failed: auditFailed,
      errorRate,
      averageDurationMs: Math.round(auditAvgDuration[0]?.avgDurationMs || 0),
      byAction: auditByAction.map((row) => ({
        action: row._id || 'Unknown',
        count: row.count,
        failures: row.failures
      })),
      byRole: auditByRole.map((row) => ({
        role: row._id || 'unknown',
        count: row.count
      })),
      recentErrors: recentAuditErrors.map((log) => ({
        id: String(log._id),
        time: log.createdAt,
        action: log.action,
        message: log.message,
        actorName: log.actorName,
        role: log.role,
        requestId: log.requestId
      }))
    },
    http: {
      total: httpCompleted,
      failed: httpErrors,
      successful: httpCompleted - httpErrors,
      errorRate: httpCompleted ? Number(((httpErrors / httpCompleted) * 100).toFixed(1)) : 0,
      averageResponseMs: Math.round(avgDuration[0]?.avgDurationMs || 0)
    },
    mcp: {
      toolCalls: mcpTools.reduce((sum, row) => sum + row.calls, 0),
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
    health: {
      ok: dbConnected,
      uptimeMs,
      uptimeHuman: formatDuration(uptimeMs),
      environment: config.nodeEnv
    }
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

export async function getFilterOptions() {
  const actions = [...new Set([...REST_AUDIT_ACTIONS, ...Object.values(MCP_ACTION_LABELS)])].sort();
  return {
    actions,
    roles: ['admin', 'doctor', 'patient'],
    statuses: ['success', 'error']
  };
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
