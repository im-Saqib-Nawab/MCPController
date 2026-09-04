import { ipKeyGenerator } from 'express-rate-limit';
import { RateLimitCounter } from '../models/RateLimitCounter.js';
import { incrementMetric } from './runtime-metrics.js';
import { config } from '../config/env.js';

/**
 * MongoDB-backed rate limit store so limits apply consistently across app instances.
 */
export class MongoRateLimitStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const now = Date.now();
    const existing = await RateLimitCounter.findOne({ key }).lean();

    if (!existing || new Date(existing.resetAt).getTime() <= now) {
      const resetAt = new Date(now + this.windowMs);
      const row = await RateLimitCounter.findOneAndUpdate(
        { key },
        { $set: { key, hits: 1, resetAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      return {
        totalHits: row?.hits || 1,
        resetTime: new Date(row?.resetAt || resetAt).getTime()
      };
    }

    const row = await RateLimitCounter.findOneAndUpdate(
      { key },
      { $inc: { hits: 1 } },
      { new: true }
    ).lean();

    return {
      totalHits: row?.hits || 1,
      resetTime: new Date(row?.resetAt || now + this.windowMs).getTime()
    };
  }

  async decrement(key) {
    await RateLimitCounter.updateOne({ key, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await RateLimitCounter.deleteOne({ key });
  }
}

export function createMongoRateLimitOptions({ windowMs, limit }) {
  // Serverless isolates should not depend on MongoDB before the DB connection middleware runs.
  const useMongoStore = !config.isTest && !process.env.VERCEL;

  return {
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    ...(useMongoStore ? { store: new MongoRateLimitStore(windowMs) } : {}),
    keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown'),
    handler: (_req, res, _next, options) => {
      incrementMetric('rate_limit_hits_total');
      res.status(options.statusCode).json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again later.'
      });
    }
  };
}
