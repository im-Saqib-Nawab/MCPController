import mongoose from 'mongoose';

/**
 * An OAuth client is an application (ChatGPT, MCP Inspector, etc.) that wants
 * tokens to call this MCP server. Clients are stored in MongoDB so we never
 * hardcode "ChatGPT" in the authorization logic — the consent page shows
 * whatever clientName was registered.
 */
const oauthClientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true },
    clientName: { type: String, required: true },
    // Hashed secret for confidential clients. Public clients (ChatGPT) use PKCE instead.
    clientSecretHash: { type: String, default: null },
    redirectUris: { type: [String], required: true },
    allowedScopes: { type: [String], default: ['read', 'write', 'delete'] },
    tokenEndpointAuthMethod: {
      type: String,
      enum: ['none', 'client_secret_post', 'client_secret_basic'],
      default: 'none'
    },
    // When the client_id is an HTTPS URL (Client ID Metadata Document), we store it here.
    clientUri: { type: String, default: null },
    grantTypes: {
      type: [String],
      default: ['authorization_code', 'refresh_token']
    }
  },
  { timestamps: true }
);

export const OAuthClient = mongoose.model('OAuthClient', oauthClientSchema);
