import pino from 'pino';
import { config } from '../config/env.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'password',
  'clientSecret',
  'client_secret',
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'token',
  'code',
  'code_verifier',
  'codeVerifier',
  'authorization',
  'cookie',
  '*.password',
  '*.clientSecret',
  '*.client_secret',
  '*.access_token',
  '*.refresh_token',
  '*.code_verifier',
  '*.codeVerifier'
];

function buildLoggerOptions() {
  const base = {
    level: config.logLevel,
    base: {
      service: config.mcpServerName,
      env: config.nodeEnv
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]'
    },
    timestamp: pino.stdTimeFunctions.isoTime
  };

  if (config.nodeEnv === 'test') {
    return { ...base, level: 'silent' };
  }

  if (!config.isProduction) {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,service,env'
        }
      }
    };
  }

  return base;
}

export const logger = pino(buildLoggerOptions());

export function serializeError(err) {
  if (!err) {
    return undefined;
  }

  return {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status,
    stack: err.stack
  };
}
