import { config } from '../config/env.js';
import { isLoadTestRunning } from '../services/testCenter.service.js';

/**
 * Rate limits are skipped only in local development and automated tests.
 * Deployed environments (production/staging) always enforce limits.
 */
export async function shouldSkipRateLimit() {
  if (config.isTest) {
    return true;
  }

  if (config.isProduction || config.isStaging) {
    return false;
  }

  if (process.env.LOAD_TEST === 'true') {
    return true;
  }

  return isLoadTestRunning();
}
