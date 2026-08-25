import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Reuse one connection across Vercel invocations in the same isolate.
 * Cold starts open a new connection; warm starts reuse globalThis.
 */
const cache = globalThis;

export async function connectDatabase(uri = config.mongodbUri) {
  mongoose.set('strictQuery', true);

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cache.__mcpcontrollerMongo) {
    cache.__mcpcontrollerMongo = mongoose.connect(uri);
  }

  try {
    await cache.__mcpcontrollerMongo;
  } catch (err) {
    cache.__mcpcontrollerMongo = null;
    throw err;
  }

  return mongoose.connection;
}

export async function disconnectDatabase() {
  cache.__mcpcontrollerMongo = null;
  await mongoose.disconnect();
}
