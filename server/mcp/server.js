import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { config } from '../config/env.js';
import { getProfileTool } from './tools/getProfile.tool.js';
import { getDataTool } from './tools/getData.tool.js';
import { createDataTool } from './tools/createData.tool.js';
import { updateDataTool } from './tools/updateData.tool.js';
import { deleteDataTool } from './tools/deleteData.tool.js';

function errorResult(err) {
  return {
    content: [{ type: 'text', text: err.message || 'Tool failed.' }],
    isError: true
  };
}

function wrap(handler) {
  return async (args) => {
    try {
      return await handler(args || {});
    } catch (err) {
      return errorResult(err);
    }
  };
}

/**
 * Factory used by createMcpHandler: a new McpServer is built for every HTTP
 * request. That is required on serverless hosts (Vercel) because there is no
 * long-lived process to hold Streamable HTTP sessions in memory.
 *
 * authInfo comes from requireMcpBearer → req.auth → toNodeHandler.
 */
export function buildMcpServer(authInfo) {
  const server = new McpServer({
    name: config.mcpServerName,
    version: config.mcpServerVersion,
    instructions:
      'MCPController practice tools. Use get_profile and get_data to read. Use create_data and update_data to write. delete_data requires the delete scope.'
  });

  server.registerTool(
    'get_profile',
    {
      description: 'Return the authenticated user profile. Requires the read scope. Use this when the user asks who they are.',
      annotations: { readOnlyHint: true }
    },
    wrap(getProfileTool(authInfo))
  );

  server.registerTool(
    'get_data',
    {
      description: 'List the user\'s sample records from MongoDB. Requires the read scope.',
      annotations: { readOnlyHint: true }
    },
    wrap(getDataTool(authInfo))
  );

  server.registerTool(
    'create_data',
    {
      description: 'Create a sample record in MongoDB. Requires the write scope.',
      inputSchema: z.object({
        title: z.string().min(1).describe('Short title for the record'),
        content: z.string().optional().describe('Optional body text')
      })
    },
    wrap(createDataTool(authInfo))
  );

  server.registerTool(
    'update_data',
    {
      description: 'Update one of the user\'s sample records. Requires the write scope.',
      inputSchema: z.object({
        id: z.string().min(1).describe('MongoDB id of the record'),
        title: z.string().min(1).optional(),
        content: z.string().optional()
      })
    },
    wrap(updateDataTool(authInfo))
  );

  server.registerTool(
    'delete_data',
    {
      description: 'Delete one of the user\'s sample records. Requires the delete scope.',
      inputSchema: z.object({
        id: z.string().min(1).describe('MongoDB id of the record')
      })
    },
    wrap(deleteDataTool(authInfo))
  );

  return server;
}
