import mongoose from 'mongoose';

/**
 * The authorization code is the short-lived proof that a user approved a client.
 * ChatGPT later swaps this code for an access token. We persist it so the token
 * endpoint can check: same client, same user, same redirect URI, unused, not expired.
 * PKCE challenge is stored so the token request must present the matching verifier.
 */
const authorizationCodeSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  redirectUri: { type: String, required: true },
  scopes: { type: [String], required: true },
  resource: { type: String, required: true },
  codeChallenge: { type: String, required: true },
  codeChallengeMethod: { type: String, enum: ['S256'], default: 'S256' },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false }
});

authorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthorizationCode = mongoose.model(
  'AuthorizationCode',
  authorizationCodeSchema
);
