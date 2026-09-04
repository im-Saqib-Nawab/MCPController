import * as Sentry from '@sentry/node';
import { config } from '../config/env.js';

let initialized = false;

export function initSentry() {
  if (initialized || !config.sentryDsn || config.isTest) {
    return;
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    release: config.mcpServerVersion,
    tracesSampleRate: config.isProduction ? 0.1 : 0
  });

  initialized = true;
}

export function captureServerError(err, context = {}) {
  if (!initialized || !err) {
    return;
  }

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null) {
        scope.setExtra(key, value);
      }
    }

    Sentry.captureException(err);
  });
}

export { Sentry };
