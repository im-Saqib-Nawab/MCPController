import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';

export const ROLLOUT_COOKIE_NAME = 'mcpcontroller_rollout';
export const ANON_COOKIE_NAME = 'mcpcontroller_anon';

const ASSIGNMENTS = ['production', 'canary'];

function stripSlash(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

export function rolloutBucket(subject, epoch) {
  const hash = crypto
    .createHash('sha256')
    .update(`${epoch}:${String(subject)}`)
    .digest();
  return hash.readUInt32BE(0) % 100;
}

export function computeAssignment(subject, percentage, epoch) {
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0) {
    return 'production';
  }
  if (pct >= 100) {
    return 'canary';
  }
  return rolloutBucket(subject, epoch) < pct ? 'canary' : 'production';
}

function signAssignmentPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAssignmentCookie(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const [body, sig] = value.split('.');
  if (!body || !sig) {
    return null;
  }

  const expected = crypto.createHmac('sha256', config.jwtSecret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!ASSIGNMENTS.includes(payload.assignment)) {
      return null;
    }
    if (!Number.isInteger(payload.epoch) || payload.epoch < 1) {
      return null;
    }
    if (!payload.subject || typeof payload.subject !== 'string') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createAssignmentCookieValue({ assignment, epoch, subject }) {
  return signAssignmentPayload({ assignment, epoch, subject });
}

export function rolloutCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction || config.isStaging,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  };
}

export function anonCookieOptions() {
  return rolloutCookieOptions();
}

function decodeSessionSubject(req) {
  const token = req.cookies?.[config.cookieName];
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload?.sub) {
      return `user:${payload.sub}`;
    }
  } catch {
    // Ignore invalid session tokens for routing purposes.
  }

  return null;
}

function bearerSubject(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice(7).trim();
  if (!token) {
    return null;
  }

  return `bearer:${crypto.createHash('sha256').update(token).digest('hex')}`;
}

export function resolveRoutingSubject(req) {
  return decodeSessionSubject(req) || bearerSubject(req) || anonSubject(req);
}

function anonSubject(req) {
  const existing = req.cookies?.[ANON_COOKIE_NAME];
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) {
    return `anon:${existing}`;
  }
  return null;
}

export function createAnonymousId() {
  return crypto.randomBytes(16).toString('hex');
}

export function resolveStickyAssignment(req, rollout) {
  const subject = resolveRoutingSubject(req);
  const epoch = rollout.assignmentEpoch ?? 1;
  const percentage = rollout.rolloutEnabled ? rollout.canaryPercentage : 0;
  const hasCanaryTarget = Boolean(stripSlash(rollout.canaryDeploymentUrl));

  if (!hasCanaryTarget || !rollout.canaryVersion) {
    return {
      assignment: 'production',
      subject,
      epoch,
      reason: 'no_canary_target'
    };
  }

  const cookiePayload = verifyAssignmentCookie(req.cookies?.[ROLLOUT_COOKIE_NAME]);
  if (
    cookiePayload &&
    cookiePayload.epoch === epoch &&
    (!subject || cookiePayload.subject === subject)
  ) {
    if (percentage <= 0) {
      return {
        assignment: 'production',
        subject: cookiePayload.subject || subject,
        epoch,
        reason: 'epoch_active_zero_percent'
      };
    }

    if (percentage >= 100) {
      return {
        assignment: 'canary',
        subject: cookiePayload.subject || subject,
        epoch,
        reason: 'epoch_active_full_rollout'
      };
    }

    return {
      assignment: cookiePayload.assignment,
      subject: cookiePayload.subject || subject,
      epoch,
      reason: 'cookie'
    };
  }

  if (cookiePayload && cookiePayload.epoch !== epoch && percentage <= 0) {
    return {
      assignment: 'production',
      subject: subject || cookiePayload.subject,
      epoch,
      reason: 'epoch_reset_zero_percent'
    };
  }

  const effectiveSubject = subject || cookiePayload?.subject;
  if (!effectiveSubject) {
    return {
      assignment: 'production',
      subject: null,
      epoch,
      reason: 'anonymous_pending'
    };
  }

  const assignment = computeAssignment(effectiveSubject, percentage, epoch);
  return {
    assignment,
    subject: effectiveSubject,
    epoch,
    reason: 'computed'
  };
}

export function shouldProxyToCanary(assignment, rollout, isRouter) {
  if (!isRouter) {
    return false;
  }

  const target = stripSlash(rollout.canaryDeploymentUrl);
  if (!target || !rollout.canaryVersion) {
    return false;
  }

  if (!rollout.rolloutEnabled || rollout.canaryPercentage <= 0) {
    return false;
  }

  return assignment === 'canary';
}
