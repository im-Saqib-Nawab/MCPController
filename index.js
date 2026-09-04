/**
 * Vercel Express entry point.
 *
 * Vercel detects this file, bundles the Express app, and routes all
 * non-static requests here. Static assets are served from client/dist
 * via outputDirectory in vercel.json.
 */

import { initSentry } from './server/lib/sentry.js';

initSentry();

export { default } from './server/app.js';

export const config = {
  maxDuration: 60
};
