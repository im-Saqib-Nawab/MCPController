import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { logger } from './lib/logger.js';
import app from './app.js';

async function main() {
  try {
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
