import { z } from 'zod';

import * as deploymentService from '../services/deployment.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { isSuperAdminEmail } from '../middleware/auth.middleware.js';

const percentageSchema = z.object({
  percentage: z.coerce.number().int().min(0).max(100)
});

const canaryTargetSchema = z.object({
  canaryDeploymentUrl: z.string().url(),
  canaryVersion: z.string().min(1).max(120).optional()
});

const enabledSchema = z.object({
  enabled: z.boolean()
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', result.error.issues[0]?.message || 'Validation failed');
  }
  return result.data;
}

export async function overview(req, res, next) {
  try {
    const data = await deploymentService.getDeploymentOverview();
    res.json({
      ...data,
      permissions: {
        canManage: isSuperAdminEmail(req.user?.email),
        isSuperAdmin: isSuperAdminEmail(req.user?.email)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function audits(req, res, next) {
  try {
    const audits = await deploymentService.listDeploymentAudits({
      limit: req.query.limit
    });
    res.json({ audits });
  } catch (err) {
    next(err);
  }
}

export async function setPercentage(req, res, next) {
  try {
    const parsed = parseOrThrow(percentageSchema, req.body);
    const rollout = await deploymentService.setRolloutPercentage({
      percentage: parsed.percentage,
      adminUser: req.user,
      requestId: req.requestId
    });
    res.json({ rollout });
  } catch (err) {
    next(err);
  }
}

export async function setCanaryTarget(req, res, next) {
  try {
    const parsed = parseOrThrow(canaryTargetSchema, req.body);
    const rollout = await deploymentService.updateCanaryTarget({
      canaryDeploymentUrl: parsed.canaryDeploymentUrl,
      canaryVersion: parsed.canaryVersion,
      adminUser: req.user,
      requestId: req.requestId
    });
    res.json({ rollout });
  } catch (err) {
    next(err);
  }
}

export async function setEnabled(req, res, next) {
  try {
    const parsed = parseOrThrow(enabledSchema, req.body);
    const rollout = await deploymentService.setRolloutEnabled({
      enabled: parsed.enabled,
      adminUser: req.user,
      requestId: req.requestId
    });
    res.json({ rollout });
  } catch (err) {
    next(err);
  }
}

export async function rollback(req, res, next) {
  try {
    const rollout = await deploymentService.rollbackRollout({
      adminUser: req.user,
      requestId: req.requestId
    });
    res.json({ rollout });
  } catch (err) {
    next(err);
  }
}

export async function promote(req, res, next) {
  try {
    const rollout = await deploymentService.promoteCanary({
      adminUser: req.user,
      requestId: req.requestId
    });
    res.json({ rollout });
  } catch (err) {
    next(err);
  }
}

export async function syncProductionVersion(req, res, next) {
  try {
    const rollout = await deploymentService.syncProductionVersion({
      productionVersion: req.body?.productionVersion,
      adminUser: req.user,
      requestId: req.requestId
    });
    res.json({ rollout });
  } catch (err) {
    next(err);
  }
}
