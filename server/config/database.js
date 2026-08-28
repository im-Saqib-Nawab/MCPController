import mongoose from 'mongoose';
import { config } from './env.js';

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
    promise: null
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
    serverSelectionTimeoutMS: 10000
  });

  try {
    await cache.promise;
    return mongoose.connection;
  } catch (err) {
    /*
     * Clear cached promise on failure so subsequent requests don't instantly reject
     */
    cache.promise = null;
    cache.uri = null;

    throw err;
  }
}

export async function disconnectDatabase() {
  /*
   * Explicit disconnect - primarily used in CLI seed scripts and test teardowns.
   * Do NOT call this inside standard API/Express route handlers.
   */
  cache.promise = null;
  cache.uri = null;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}