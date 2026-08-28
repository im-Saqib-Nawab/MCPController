import mongoose from 'mongoose';

/**
 * Stores hashed OAuth access and refresh tokens.
 *
 * Raw bearer tokens are never stored in MongoDB.
 * If the database is compromised, an attacker cannot directly use the
 * stored hashes as MCP credentials.
 *
 * One AccessToken document represents one OAuth token grant.
 */
const accessTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    refreshTokenHash: {
      type: String,
      default: null,
      index: true
    },

    clientId: {
      type: String,
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    scopes: {
      type: [String],
      required: true,
      default: []
    },

    /**
     * RFC 8707 resource indicator.
     * The token is valid only for this exact MCP resource.
     */
    resource: {
      type: String,
      required: true,
      trim: true
    },

    /**
     * Access-token expiration time.
     */
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    /**
     * Refresh-token expiration time.
     * Null means this grant has no refresh token.
     */
    refreshExpiresAt: {
      type: Date,
      default: null,
      index: true
    },

    /**
     * Final grant expiration timestamp used specifically for TTL index cleanup.
     * Set to max(expiresAt, refreshExpiresAt).
     */
    grantExpiresAt: {
      type: Date,
      required: true,
      index: true
    },

    /**
     * Revocation applies to the complete token grant.
     */
    revoked: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

/**
 * Pre-validate Hook:
 * Sets `grantExpiresAt` dynamically so MongoDB TTL cleanup only drops
 * the document AFTER the refresh token (if present) has also expired.
 */
accessTokenSchema.pre('validate', function (next) {
  if (this.refreshExpiresAt && this.refreshExpiresAt > this.expiresAt) {
    this.grantExpiresAt = this.refreshExpiresAt;
  } else {
    this.grantExpiresAt = this.expiresAt;
  }
  next();
});

/**
 * Automatically remove expired token grant records safely.
 *
 * Note: MongoDB TTL runs periodically (every ~60s).
 * Middleware/Service layers MUST still explicitly check `expiresAt` & `refreshExpiresAt`.
 */
accessTokenSchema.index(
  { grantExpiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const AccessToken = mongoose.model('AccessToken', accessTokenSchema);