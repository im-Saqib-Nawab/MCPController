import * as latencyService from '../services/latency.service.js';
import * as sloService from '../services/slo.service.js';
import * as latencyAlertService from '../services/latency-alert.service.js';
import { AppError } from '../middleware/error.middleware.js';

function parseLatencyFilters(query = {}) {
  return {
    sinceMinutes: query.sinceMinutes ? Number(query.sinceMinutes) : undefined,
    since: query.since,
    until: query.until,
    route: query.route || query.endpoint,
    method: query.method,
    statusCode: query.statusCode ? Number(query.statusCode) : undefined,
    deploymentVersion: query.deploymentVersion,
    role: query.role,
    userId: query.userId,
    action: query.action,
    search: query.search,
    metric: query.metric,
    limit: query.limit ? Number(query.limit) : undefined
  };
}

export async function latencyOverview(req, res, next) {
  try {
    const filters = parseLatencyFilters(req.query);
    const slos = await sloService.getAllEnabledSlos();
    const overview = await latencyService.getLatencyOverview(req.user, filters, slos);
    res.json({ latency: overview });
  } catch (err) {
    next(err);
  }
}

export async function endpointSlowRequests(req, res, next) {
  try {
    const route = req.query.route || req.query.endpoint;
    if (!route) {
      throw new AppError(400, 'invalid_request', 'Endpoint route is required.');
    }

    const result = await latencyService.getEndpointSlowRequests(req.user, {
      ...parseLatencyFilters(req.query),
      route: decodeURIComponent(String(route))
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function requestDetail(req, res, next) {
  try {
    const detail = await latencyService.getRequestLatencyDetail(req.user, req.params.requestId);
    if (!detail || (!detail.durationMs && !detail.trace)) {
      throw new AppError(404, 'not_found', 'Request latency detail not found.');
    }
    res.json({ request: detail });
  } catch (err) {
    next(err);
  }
}

export async function listSlos(req, res, next) {
  try {
    res.json({ slos: await sloService.listSlos(parseLatencyFilters(req.query)) });
  } catch (err) {
    next(err);
  }
}

export async function createSlo(req, res, next) {
  try {
    res.status(201).json({ slo: await sloService.createSlo(req.user, req.body) });
  } catch (err) {
    next(err);
  }
}

export async function updateSlo(req, res, next) {
  try {
    res.json({ slo: await sloService.updateSlo(req.user, req.params.sloId, req.body) });
  } catch (err) {
    next(err);
  }
}

export async function deleteSlo(req, res, next) {
  try {
    res.json(await sloService.deleteSlo(req.user, req.params.sloId));
  } catch (err) {
    next(err);
  }
}

export async function sloAudit(req, res, next) {
  try {
    res.json({ audit: await sloService.getSloAudit(req.params.sloId) });
  } catch (err) {
    next(err);
  }
}

export async function listAlerts(req, res, next) {
  try {
    res.json({ alerts: await latencyAlertService.listAlerts(req.query) });
  } catch (err) {
    next(err);
  }
}

export async function alertDetail(req, res, next) {
  try {
    const alert = await latencyAlertService.getAlert(req.params.alertId);
    if (!alert) {
      throw new AppError(404, 'not_found', 'Alert not found.');
    }
    res.json({ alert });
  } catch (err) {
    next(err);
  }
}
