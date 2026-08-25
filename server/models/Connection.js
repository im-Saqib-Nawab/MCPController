import mongoose from 'mongoose';

/**
 * One Connection row per user + OAuth client. The dashboard reads this collection
 * to show which applications currently have access and which scopes were granted.
 */
const connectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true },
  clientName: { type: String, required: true },
  scopes: { type: [String], required: true },
  connectedAt: { type: Date, default: Date.now }
});

connectionSchema.index({ userId: 1, clientId: 1 }, { unique: true });

export const Connection = mongoose.model('Connection', connectionSchema);
