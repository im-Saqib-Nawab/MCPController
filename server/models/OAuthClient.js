import mongoose from 'mongoose';

const oauthClientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true, trim: true },
    clientSecretHash: { type: String, default: null, select: false },
    redirectUris: { type: [String], required: true, default: [] },
    allowedScopes: { type: [String], required: true, default: [] },
    tokenEndpointAuthMethod: {
      type: String,
      enum: ['none', 'client_secret_post', 'client_secret_basic'],
      default: 'none'
    },
    grantTypes: {
      type: [String],
      default: ['authorization_code', 'refresh_token']
    },
    clientUri: { type: String, default: null },
    jwksUri: { type: String, default: null }
  },
  { timestamps: true }
);

export const OAuthClient = mongoose.model('OAuthClient', oauthClientSchema);
