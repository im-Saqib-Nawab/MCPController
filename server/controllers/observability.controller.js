import * as observabilityService from '../services/observability.service.js';
import { AppError } from '../middleware/error.middleware.js';

function parseFilters(query = {}) {
  return {
    sinceMinutes: query.sinceMinutes ? Number(query.sinceMinutes) : undefined,
    since: query.since,
    until: query.until,
    page: query.page,
    limit: query.limit ? Number(query.limit) : undefined,
    level: query.level,
    operation: query.operation,
    action: query.action,
    tool: query.tool,
    userId: query.userId,
    actorName: query.actorName,
    role: query.role,
    status: query.status,
    requestId: query.requestId,
    search: query.search,
    minDurationMs: query.minDurationMs ? Number(query.minDurationMs) : undefined,
    includeTechnical: query.includeTechnical === 'true',
    auditOnly: query.auditOnly !== 'false'
  };
}

export async function overview(req, res, next) {
  try {
    res.json({ overview: await observabilityService.getOverview(req.user, parseFilters(req.query)) });
  } catch (err) {
    next(err);
  }
}

export async function metrics(req, res, next) {
  try {
    res.json({ metrics: await observabilityService.getMetrics(req.user, parseFilters(req.query)) });
  } catch (err) {
    next(err);
  }
}

export async function logs(req, res, next) {
  try {
    const result = await observabilityService.listLogs(req.user, parseFilters(req.query));
    if (Array.isArray(result)) {
      res.json({ logs: result });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logDetail(req, res, next) {
  try {
    res.json({ log: await observabilityService.fetchLog(req.user, req.params.logId) });
  } catch (err) {
    next(err);
  }
}

export async function traces(req, res, next) {
  try {
    const result = await observabilityService.listTraces(req.user, parseFilters(req.query));
    if (Array.isArray(result)) {
      res.json({ traces: result });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function traceDetail(req, res, next) {
  try {
    const trace = await observabilityService.getTrace(req.user, req.params.requestId);
    if (!trace) {
      throw new AppError(404, 'not_found', 'Trace not found.');
    }
    res.json({ trace });
  } catch (err) {
    next(err);
  }
}

export async function filters(req, res, next) {
  try {
    res.json({ filters: await observabilityService.getFilterOptions() });
  } catch (err) {
    next(err);
  }
}
