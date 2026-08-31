import * as observabilityService from '../services/observability.service.js';
import { AppError } from '../middleware/error.middleware.js';

function parseFilters(query = {}) {
  return {
    sinceMinutes: query.sinceMinutes ? Number(query.sinceMinutes) : undefined,
    since: query.since,
    until: query.until,
    limit: query.limit ? Number(query.limit) : undefined,
    level: query.level,
    operation: query.operation,
    tool: query.tool,
    userId: query.userId,
    requestId: query.requestId,
    search: query.search,
    status: query.status
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
    res.json({ logs: await observabilityService.listLogs(req.user, parseFilters(req.query)) });
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
    res.json({ traces: await observabilityService.listTraces(req.user, parseFilters(req.query)) });
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
