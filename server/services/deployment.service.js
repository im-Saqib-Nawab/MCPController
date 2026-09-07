import {
  DeploymentRollout,
  DEPLOYMENT_ROLLOUT_KEY,
  ROLLOUT_STATUSES
} from '../models/DeploymentRollout.js';
import { DeploymentRolloutAudit } from '../models/DeploymentRolloutAudit.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { logAudit } from '../lib/audit-log.js';
import { validateCanaryDeploymentUrl, normalizeVersionIdentifier } from '../lib/deployment-url.js';
import { computeAssignment, rolloutBucket } from '../lib/deployment-assignment.js';

const rolloutCache = {
  value: null,
  expiresAt: 0
};

function cacheTtlMs() {
  return config.deploymentRolloutCacheTtlMs;
}

function stripRollout(doc) {
  if (!doc) {
    return null;
  }

  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;

  return {
    key: plain.key,
    productionVersion: plain.productionVersion,
    canaryVersion: plain.canaryVersion,
    canaryDeploymentUrl: plain.canaryDeploymentUrl || '',
    canaryPercentage: plain.canaryPercentage ?? 0,
    rolloutEnabled: Boolean(plain.rolloutEnabled),
    rolloutStatus: plain.rolloutStatus,
    assignmentEpoch: plain.assignmentEpoch ?? 1,
    updatedBy: plain.updatedBy ? String(plain.updatedBy) : null,
    updatedByEmail: plain.updatedByEmail || '',
    updatedAt: plain.updatedAt,
    createdAt: plain.createdAt
  };
}

export async function getRolloutConfig({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && rolloutCache.value && rolloutCache.expiresAt > now) {
    return rolloutCache.value;
  }

  let doc = await DeploymentRollout.findOne({ key: DEPLOYMENT_ROLLOUT_KEY });

  if (!doc) {
    doc = await DeploymentRollout.create({
      key: DEPLOYMENT_ROLLOUT_KEY,
      productionVersion: config.deploymentVersion,
      rolloutStatus: 'idle'
    });
  }

  const value = stripRollout(doc);
  rolloutCache.value = value;
  rolloutCache.expiresAt = now + cacheTtlMs();
  return value;
}

function invalidateRolloutCache() {
  rolloutCache.value = null;
  rolloutCache.expiresAt = 0;
}

async function writeAudit({
  adminUser,
  action,
  previousValue,
  newValue,
  requestId
}) {
  await DeploymentRolloutAudit.create({
    adminUserId: adminUser?._id || null,
    adminEmail: adminUser?.email || '',
    role: adminUser?.role || '',
    action,
    previousValue,
    newValue,
    requestId: requestId || ''
  });

  logAudit(adminUser, action, {
    status: 'success',
    metadata: {
      previousValue,
      newValue,
      requestId
    }
  });
}

function assertPercentage(value) {
  const pct = Number(value);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    throw new AppError(400, 'invalid_request', 'Canary percentage must be an integer between 0 and 100.');
  }
  return pct;
}

function snapshotRollout(rollout) {
  return {
    productionVersion: rollout.productionVersion,
    canaryVersion: rollout.canaryVersion,
    canaryDeploymentUrl: rollout.canaryDeploymentUrl,
    canaryPercentage: rollout.canaryPercentage,
    rolloutEnabled: rollout.rolloutEnabled,
    rolloutStatus: rollout.rolloutStatus,
    assignmentEpoch: rollout.assignmentEpoch
  };
}

async function loadMutableRollout() {
  let doc = await DeploymentRollout.findOne({ key: DEPLOYMENT_ROLLOUT_KEY });
  if (!doc) {
    doc = await DeploymentRollout.create({
      key: DEPLOYMENT_ROLLOUT_KEY,
      productionVersion: config.deploymentVersion,
      rolloutStatus: 'idle'
    });
  }
  return doc;
}

async function saveRollout(doc, adminUser, action, requestId) {
  const previousValue = snapshotRollout(stripRollout(doc));
  doc.updatedBy = adminUser._id;
  doc.updatedByEmail = adminUser.email;
  await doc.save();
  invalidateRolloutCache();
  const next = stripRollout(doc);
  await writeAudit({
    adminUser,
    action,
    previousValue,
    newValue: snapshotRollout(next),
    requestId
  });
  return next;
}

function assertRouterControlPlane() {
  if (!config.isDeploymentRouter) {
    throw new AppError(
      403,
      'forbidden',
      'Deployment control is only available on the production router deployment.'
    );
  }
}

function assertCanaryReady(doc) {
  if (!doc.canaryDeploymentUrl || !doc.canaryVersion) {
    throw new AppError(
      400,
      'invalid_request',
      'Configure a canary deployment URL and version before changing rollout traffic.'
    );
  }
}

export async function getDeploymentOverview() {
  assertRouterControlPlane();
  const rollout = await getRolloutConfig({ fresh: true });

  return {
    rollout,
    router: {
      deploymentVersion: config.deploymentVersion,
      deploymentRole: config.deploymentRole,
      publicUrl: config.apiUrl,
      isRouter: config.isDeploymentRouter
    },
    assignmentPreview: buildAssignmentPreview(rollout)
  };
}

function buildAssignmentPreview(rollout) {
  const epoch = rollout.assignmentEpoch ?? 1;
  const pct = rollout.rolloutEnabled ? rollout.canaryPercentage : 0;
  let canary = 0;

  for (let bucket = 0; bucket < 100; bucket += 1) {
    if (bucket < pct) {
      canary += 1;
    }
  }

  return {
    expectedCanaryPercent: pct,
    expectedProductionPercent: 100 - pct,
    bucketCanaryCount: canary,
    bucketProductionCount: 100 - canary,
    assignmentEpoch: epoch
  };
}

export async function updateCanaryTarget({ canaryDeploymentUrl, canaryVersion, adminUser, requestId }) {
  assertRouterControlPlane();

  const doc = await loadMutableRollout();
  let normalizedUrl;
  let normalizedVersion;

  try {
    normalizedUrl = await validateCanaryDeploymentUrl(canaryDeploymentUrl);
    normalizedVersion = normalizeVersionIdentifier(
      canaryVersion,
      config.deploymentVersion
    );
  } catch (err) {
    throw new AppError(400, 'invalid_request', err.message || 'Invalid canary deployment URL.');
  }

  doc.canaryDeploymentUrl = normalizedUrl;
  doc.canaryVersion = normalizedVersion;

  if (!doc.productionVersion) {
    doc.productionVersion = config.deploymentVersion;
  }

  if (doc.rolloutEnabled && doc.canaryPercentage > 0) {
    doc.rolloutStatus = 'rolling';
  } else if (doc.canaryVersion) {
    doc.rolloutStatus = doc.rolloutEnabled ? doc.rolloutStatus : 'idle';
  }

  return saveRollout(doc, adminUser, 'set_canary_target', requestId);
}

export async function setRolloutPercentage({ percentage, adminUser, requestId }) {
  assertRouterControlPlane();

  const pct = assertPercentage(percentage);
  const doc = await loadMutableRollout();

  if (pct > 0) {
    assertCanaryReady(doc);
  }

  const previousPercentage = doc.canaryPercentage ?? 0;

  doc.canaryPercentage = pct;
  doc.rolloutEnabled = pct > 0;
  doc.rolloutStatus = pct > 0 ? 'rolling' : doc.canaryVersion ? 'idle' : 'idle';

  if (pct === 0 && previousPercentage > 0) {
    doc.assignmentEpoch = (doc.assignmentEpoch || 1) + 1;
  }

  return saveRollout(doc, adminUser, 'set_percentage', requestId);
}

export async function setRolloutEnabled({ enabled, adminUser, requestId }) {
  assertRouterControlPlane();

  const doc = await loadMutableRollout();

  if (enabled) {
    assertCanaryReady(doc);
    if (doc.canaryPercentage <= 0) {
      throw new AppError(400, 'invalid_request', 'Set a canary percentage above 0 before enabling rollout.');
    }
  } else {
    doc.canaryPercentage = 0;
  }

  doc.rolloutEnabled = Boolean(enabled) && doc.canaryPercentage > 0;
  doc.rolloutStatus = doc.rolloutEnabled ? 'paused' : 'idle';

  return saveRollout(doc, adminUser, enabled ? 'enable_rollout' : 'disable_rollout', requestId);
}

export async function rollbackRollout({ adminUser, requestId }) {
  assertRouterControlPlane();

  const doc = await loadMutableRollout();
  doc.canaryPercentage = 0;
  doc.rolloutEnabled = false;
  doc.rolloutStatus = 'idle';
  doc.assignmentEpoch = (doc.assignmentEpoch || 1) + 1;

  return saveRollout(doc, adminUser, 'rollback', requestId);
}

export async function promoteCanary({ adminUser, requestId }) {
  assertRouterControlPlane();

  const doc = await loadMutableRollout();
  assertCanaryReady(doc);

  const previousProduction = doc.productionVersion;
  doc.productionVersion = doc.canaryVersion;
  doc.canaryVersion = '';
  doc.canaryDeploymentUrl = '';
  doc.canaryPercentage = 0;
  doc.rolloutEnabled = false;
  doc.rolloutStatus = 'promoted';
  doc.assignmentEpoch = (doc.assignmentEpoch || 1) + 1;

  const saved = await saveRollout(doc, adminUser, 'promote_canary', requestId);

  return {
    ...saved,
    promotedFrom: previousProduction
  };
}

export async function syncProductionVersion({ productionVersion, adminUser, requestId }) {
  assertRouterControlPlane();

  const doc = await loadMutableRollout();
  doc.productionVersion = normalizeVersionIdentifier(productionVersion, config.deploymentVersion);
  return saveRollout(doc, adminUser, 'sync_production_version', requestId);
}

export async function listDeploymentAudits({ limit = 50 } = {}) {
  assertRouterControlPlane();

  const audits = await DeploymentRolloutAudit.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();

  return audits.map((entry) => ({
    id: String(entry._id),
    adminUserId: entry.adminUserId ? String(entry.adminUserId) : null,
    adminEmail: entry.adminEmail,
    role: entry.role,
    action: entry.action,
    previousValue: entry.previousValue,
    newValue: entry.newValue,
    requestId: entry.requestId,
    createdAt: entry.createdAt
  }));
}

export function estimateAssignmentCounts(rollout, subjects) {
  const epoch = rollout.assignmentEpoch ?? 1;
  const pct = rollout.rolloutEnabled ? rollout.canaryPercentage : 0;
  let canary = 0;
  let production = 0;

  for (const subject of subjects) {
    const bucket = rolloutBucket(subject, epoch);
    if (bucket < pct) {
      canary += 1;
    } else {
      production += 1;
    }
  }

  return { canary, production, total: subjects.length };
}

export { ROLLOUT_STATUSES };
