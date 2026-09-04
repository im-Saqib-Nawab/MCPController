/**
 * Vercel serverless entry (must live under api/ for Vercel routing).
 */

import { initSentry } from '../server/lib/sentry.js';
import app from '../server/app.js';

try {
  initSentry();
} catch (err) {
  console.error('Sentry initialization failed:', err);
}

export default app;

export const config = {
  maxDuration: 60
};
