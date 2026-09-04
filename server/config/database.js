import mongoose from 'mongoose';
import { config } from './env.js';
import { logOperation } from '../lib/request-context.js';
import { logger } from '../lib/logger.js';

/**
 * MongoDB connection cache for local development and Vercel serverless isolates.
 *
 * Vercel reuses Node.js isolates between requests, so we store the active connection
 * promise on `globalThis` to prevent creating new connections on every request.
 *
 * Caching the promise (rather than just the resolved connection) ensures concurrent
 * cold-start requests share a single connection attempt.
 */

const globalCache = globalThis;

if (!globalCache.__mcpcontrollerMongoCache) {
  globalCache.__mcpcontrollerMongoCache = {
    uri: null,
    promise: null,
    indexesReady: false
  };
}

const cache = globalCache.__mcpcontrollerMongoCache;

export async function connectDatabase(uri = config.mongodbUri) {
  mongoose.set('strictQuery', true);

  // Return immediately if already connected to the target database
  if (
    mongoose.connection.readyState === 1 &&
    cache.uri === uri
  ) {
    return mongoose.connection;
  }

  /*
   * Reuse the ongoing connection promise if a connection attempt
   * is already in flight for this URI (prevents cold-start connection bursts).
   */
  if (cache.promise && cache.uri === uri) {
    await cache.promise;
    return mongoose.connection;
  }

  /*
   * Reset cache if the connection URI has changed
   */
  cache.uri = uri;

  cache.promise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: process.env.VERCEL ? 5000 : 10000,
    maxPoolSize: config.mongodbMaxPoolSize,
    minPoolSize: config.mongodbMinPoolSize,
    maxIdleTimeMS: process.env.VERCEL ? 10000 : 30000,
    socketTimeoutMS: 45000,
    waitQueueTimeoutMS: config.mongodbWaitQueueTimeoutMS
  });

  try {
    const connectStart = Date.now();
    await cache.promise;
    await syncCollectionIndexes();

    logOperation('debug', 'db.connected', {
      durationMs: Date.now() - connectStart,
      readyState: mongoose.connection.readyState
    });

    return mongoose.connection;
  } catch (err) {
    /*
     * Clear cached promise on failure so subsequent requests don't instantly reject
     */
    cache.promise = null;
    cache.uri = null;

    logger.error(
      {
        operation: 'db.connection.failed',
        err: {
          name: err.name,
          message: err.message,
          stack: err.stack
        }
      },
      'MongoDB connection failed'
    );

    throw err;
  }
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export async function pingDatabase() {
  if (!isDatabaseConnected()) {
    return false;
  }

  await mongoose.connection.db.admin().command({ ping: 1 });
  return true;
}

async function syncCollectionIndexes() {
  if (cache.indexesReady || !config.syncIndexesOnStartup) {
    cache.indexesReady = true;
    return;
  }

  const [
    { Doctor },
    { Appointment },
    { Medicine },
    { User },
    { Connection },
    { SystemLog },
    { RateLimitCounter },
    { BackgroundJob },
    { CreditTransaction },
    { Subscription },
    { PaymentOrder },
    { McpSessionContext }
  ] = await Promise.all([
    import('../models/Doctor.js'),
    import('../models/Appointment.js'),
    import('../models/Medicine.js'),
    import('../models/User.js'),
    import('../models/Connection.js'),
    import('../models/SystemLog.js'),
    import('../models/RateLimitCounter.js'),
    import('../models/BackgroundJob.js'),
    import('../models/CreditTransaction.js'),
    import('../models/Subscription.js'),
    import('../models/PaymentOrder.js'),
    import('../models/McpSessionContext.js')
  ]);

  try {
    await Doctor.collection.dropIndex('userId_1');
  } catch {
    // The previous unique userId index may not exist.
  }

  await Promise.all([
    Doctor.syncIndexes(),
    Appointment.syncIndexes(),
    Medicine.syncIndexes(),
    User.syncIndexes(),
    Connection.syncIndexes(),
    SystemLog.syncIndexes(),
    RateLimitCounter.syncIndexes(),
    BackgroundJob.syncIndexes(),
    CreditTransaction.syncIndexes(),
    Subscription.syncIndexes(),
    PaymentOrder.syncIndexes(),
    McpSessionContext.syncIndexes()
  ]);

  cache.indexesReady = true;
}

export async function disconnectDatabase() {
  /*
   * Explicit disconnect - primarily used in CLI seed scripts and test teardowns.
   * Do NOT call this inside standard API/Express route handlers.
   */
  cache.promise = null;
  cache.uri = null;
  cache.indexesReady = false;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
