import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import app from './app.js';

async function main() {
  await connectDatabase();
  app.listen(config.port, () => {
    console.log(`MCPController API  ${config.apiUrl}`);
    console.log(`MCP endpoint       ${config.apiUrl}/mcp`);
    console.log(`UI                 ${config.appUrl}`);
  });
}

main().catch((err) => {
  console.error('Failed to start MCPController', err);
  process.exit(1);
});
