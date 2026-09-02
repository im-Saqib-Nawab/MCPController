import * as testCenterService from '../services/testCenter.service.js';
import * as observabilityService from '../services/observability.service.js';

export async function config(req, res, next) {
  try {
    res.json({ testing: testCenterService.getConfig() });
  } catch (err) {
    next(err);
  }
}

export async function status(req, res, next) {
  try {
    res.json(testCenterService.getStatus());
  } catch (err) {
    next(err);
  }
}

export async function start(req, res, next) {
  try {
    const run = await testCenterService.startRun(req.user, req.body || {});
    res.status(202).json({ run });
  } catch (err) {
    next(err);
  }
}

export async function stop(req, res, next) {
  try {
    const result = testCenterService.stopRun();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function runs(req, res, next) {
  try {
    res.json({ runs: testCenterService.listRuns() });
  } catch (err) {
    next(err);
  }
}

export async function runDetail(req, res, next) {
  try {
    res.json({ run: testCenterService.getRun(req.params.runId) });
  } catch (err) {
    next(err);
  }
}

export async function liveObservability(req, res, next) {
  try {
    const sinceMinutes = req.query.sinceMinutes ? Number(req.query.sinceMinutes) : 15;
    const since = req.query.since;
    const includeTechnical = req.query.includeTechnical !== 'false';
    const requestId = req.query.requestId;

    const filters = {
      sinceMinutes: since ? undefined : sinceMinutes,
      since,
      limit: 100,
      includeTechnical,
      auditOnly: !includeTechnical
    };

    if (requestId) {
      filters.requestId = requestId;
      filters.includeTechnical = true;
      filters.auditOnly = false;
    }

    const [metrics, logs, traces] = await Promise.all([
      observabilityService.getMetrics(req.user, { sinceMinutes, since }),
      observabilityService.listLogs(req.user, filters),
      observabilityService.listTraces(req.user, {
        sinceMinutes,
        since,
        limit: 50,
        includeTechnical
      })
    ]);
    res.json({ metrics, logs, traces });
  } catch (err) {
    next(err);
  }
}

export async function traceDetail(req, res, next) {
  try {
    const trace = await observabilityService.getTrace(req.user, req.params.requestId);
    if (!trace) {
      return res.status(404).json({ error: 'not_found', message: 'Trace not found.' });
    }
    res.json({ trace });
  } catch (err) {
    next(err);
  }
}
