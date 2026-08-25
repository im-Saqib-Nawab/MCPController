import mongoose from 'mongoose';

/**
 * We store SHA-256 hashes of access and refresh tokens, never the raw values.
 * If the database is copied, an attacker still cannot call /mcp — they would
 * need the original token that ChatGPT holds.
 */
const accessTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  refreshTokenHash: { type: String, default: null, index: true },
  clientId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scopes: { type: [String], required: true },
  resource: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  refreshExpiresAt: { type: Date, default: null },
  revoked: { type: Boolean, default: false }
}, { timestamps: true });

export const AccessToken = mongoose.model('AccessToken', accessTokenSchema);
