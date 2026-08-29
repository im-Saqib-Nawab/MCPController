import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { config } from '../config/env.js';
import { listDoctorsTool } from './tools/listDoctors.tool.js';
import { getDoctorTool } from './tools/getDoctor.tool.js';
import { addDoctorTool } from './tools/addDoctor.tool.js';
import { updateDoctorTool } from './tools/updateDoctor.tool.js';
import { deleteDoctorTool } from './tools/deleteDoctor.tool.js';

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
      'MCPController doctor tools. Use list_doctors and get_doctor to read records. add_doctor requires doctor:create. update_doctor requires doctor:update. delete_doctor requires doctor:delete.'
  });

  server.registerTool(
    'list_doctors',
    {
      description: 'List all doctors in MongoDB. Requires doctor:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    wrap(listDoctorsTool(authInfo))
  );

  server.registerTool(
    'get_doctor',
    {
      description: 'Return one doctor by doctorId. Requires doctor:read.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor')
      }),
      annotations: { readOnlyHint: true }
    },
    wrap(getDoctorTool(authInfo))
  );

  server.registerTool(
    'add_doctor',
    {
      description: 'Create a new doctor. Requires doctor:create.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Doctor name'),
        specialization: z.string().min(1).describe('Doctor specialization'),
        email: z.string().email().optional().describe('Contact email'),
        phone: z.string().optional().describe('Contact phone'),
        availability: z.string().optional().describe('Appointment or availability notes')
      })
    },
    wrap(addDoctorTool(authInfo))
  );

  server.registerTool(
    'update_doctor',
    {
      description: 'Update an existing doctor. Requires doctor:update.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor'),
        name: z.string().min(1).optional(),
        specialization: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        availability: z.string().optional()
      })
    },
    wrap(updateDoctorTool(authInfo))
  );

  server.registerTool(
    'delete_doctor',
    {
      description: 'Delete a doctor. Requires doctor:delete.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor')
      })
    },
    wrap(deleteDoctorTool(authInfo))
  );

  return server;
}
