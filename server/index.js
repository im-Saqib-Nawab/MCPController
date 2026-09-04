import { initSentry } from './lib/sentry.js';
import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { logger } from './lib/logger.js';
import { flushLogQueue } from './services/log-store.service.js';
import app from './app.js';

async function shutdown() {
  await flushLogQueue();
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

async function main() {
  try {
    initSentry();
    await connectDatabase();

    app.listen(config.port, () => {
      logger.info(
        {
          operation: 'server.started',
          apiUrl: config.apiUrl,
          appUrl: config.appUrl,
          mcpEndpoint: `${config.apiUrl}/mcp`
        },
        'MCPController server started'
      );
    });
  } catch (err) {
    logger.error(
      {
        operation: 'server.start.failed',
        err: {
          name: err.name,
          message: err.message,
          stack: err.stack
        }
      },
      'Failed to start MCPController'
    );

    process.exit(1);
  }
}

main();
