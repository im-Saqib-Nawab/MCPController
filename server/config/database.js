import mongoose from 'mongoose';
import { config } from './env.js';

export async function connectDatabase(uri = config.mongodbUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
