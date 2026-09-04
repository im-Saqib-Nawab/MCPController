/**
 * Vercel serverless entry (must live under api/ for Vercel routing).
 */

import { initSentry } from '../server/lib/sentry.js';

initSentry();

export { default } from '../server/app.js';

export const config = {
  maxDuration: 60
};
