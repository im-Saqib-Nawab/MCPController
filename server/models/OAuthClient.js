import mongoose from 'mongoose';

const oauthClientSchema =
  new mongoose.Schema(
    {
      clientId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
      },

      clientName: {
        type: String,
        required: true,
        trim: true
      },

      /*
       * Confidential client secret.
       *
       * Public clients such as ChatGPT/CIMD use:
       *   tokenEndpointAuthMethod = none
       */
      clientSecretHash: {
        type: String,
        default: null
      },

      redirectUris: {
        type: [String],
        required: true,
        validate: {
          validator(value) {
            return (
              Array.isArray(value) &&
              value.length > 0
            );
          },

          message:
            'At least one redirect URI is required.'
        }
      },

      allowedScopes: {
        type: [String],

        default: [
          'doctor:read',
          'doctor:write',
          'doctor:delete'
        ]
      },

      tokenEndpointAuthMethod: {
        type: String,

        enum: [
          'none',
          'client_secret_post',
          'client_secret_basic',
          'private_key_jwt'
        ],

        default: 'none'
      },

      /*
       * Present when client_id itself is a CIMD URL.
       */
      clientUri: {
        type: String,
        default: null
      },

      jwksUri: {
        type: String,
        default: null
      },

      grantTypes: {
        type: [String],

        default: [
          'authorization_code',
          'refresh_token'
        ]
      }
    },

    {
      timestamps: true
    }
  );

export const OAuthClient =
  mongoose.model(
    'OAuthClient',
    oauthClientSchema
  );