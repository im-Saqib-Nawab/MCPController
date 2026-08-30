import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { config } from '../config/env.js';
import { logError, logOperation } from '../lib/request-context.js';
import { listDoctorsTool } from './tools/listDoctors.tool.js';
import { getDoctorTool } from './tools/getDoctor.tool.js';
import { addDoctorTool } from './tools/addDoctor.tool.js';
import { updateDoctorTool } from './tools/updateDoctor.tool.js';
import { deleteDoctorTool } from './tools/deleteDoctor.tool.js';
import {
  listPatientsTool,
  getPatientTool,
  addPatientTool,
  updatePatientTool,
  deletePatientTool
} from './tools/patient.tools.js';
import {
  listAppointmentsTool,
  requestAppointmentTool,
  acceptAppointmentTool,
  rejectAppointmentTool,
  suggestAlternativeDateTool,
  acceptAlternativeDateTool,
  cancelAppointmentTool,
  completeAppointmentTool,
  getAppointmentTool,
  listMyAppointmentsTool,
  listDoctorAppointmentRequestsTool,
  adminUpdateAppointmentTool,
  adminGetDashboardStatsTool
} from './tools/appointment.tools.js';
import { getMyProfileTool, updateMyProfileTool, updateAvailabilityTool } from './tools/profile.tools.js';
import { checkDoctorAvailabilityTool } from './tools/availability.tools.js';
import { searchLogsTool, getRequestLogsTool } from './tools/logs.tools.js';
import { isToolExposed } from '../services/permission.service.js';

const weeklyAvailabilitySchema = z
  .object({
    monday: z.enum(['available', 'unavailable']).optional(),
    tuesday: z.enum(['available', 'unavailable']).optional(),
    wednesday: z.enum(['available', 'unavailable']).optional(),
    thursday: z.enum(['available', 'unavailable']).optional(),
    friday: z.enum(['available', 'unavailable']).optional(),
    saturday: z.enum(['available', 'unavailable']).optional(),
    sunday: z.enum(['available', 'unavailable']).optional()
  })
  .optional();

function errorResult(err) {
  return {
    content: [{ type: 'text', text: err.message || 'Tool failed.' }],
    isError: true
  };
}

function wrap(toolName, handler, authInfo) {
  return async (args) => {
    const start = Date.now();
    const actor = {
      userId: authInfo?.extra?.userId,
      clientId: authInfo?.clientId,
      role: authInfo?.extra?.role
    };

    logOperation('info', 'mcp.tool.started', { tool: toolName, ...actor });

    try {
      const result = await handler(args || {});
      const durationMs = Date.now() - start;
      const failed = Boolean(result?.isError);

      logOperation(failed ? 'warn' : 'info', failed ? 'mcp.tool.failed' : 'mcp.tool.completed', {
        tool: toolName,
        durationMs,
        success: !failed,
        ...actor
      });

      return result;
    } catch (err) {
      logError(err, {
        operation: 'mcp.tool.error',
        tool: toolName,
        durationMs: Date.now() - start,
        ...actor
      });
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
  const grantedScopes = Array.isArray(authInfo?.scopes) ? authInfo.scopes : [];
  const effectiveScopes = Array.isArray(authInfo?.extra?.effectiveScopes)
    ? authInfo.extra.effectiveScopes
    : grantedScopes;
  const role = authInfo?.extra?.role;

  const server = new McpServer({
    name: config.mcpServerName,
    version: config.mcpServerVersion,
    instructions:
      'Doctor-patient appointment MCP for the full clinic system. Roles: admin (manage everything), doctor (own profile, availability, appointment requests), patient (browse doctors, book appointments). Appointment statuses: REQUESTED (pending), ACCEPTED, REJECTED, ALTERNATIVE_OFFERED, CANCELLED, COMPLETED. Backend rules: one accepted patient per doctor per day; cancelled/rejected days become available again; no self-booking; no past dates; no booking on unavailable weekdays. Tools are filtered to OAuth token scopes. Log tools (search_logs, get_request_logs) follow website permissions: admins always have them; other users need Read system logs enabled in the admin dashboard.'
  });

  function registerAllowed(toolName, definition, handler) {
    if (!isToolExposed(toolName, grantedScopes, role, effectiveScopes)) {
      return;
    }

    server.registerTool(toolName, definition, wrap(toolName, handler, authInfo));
  }

  registerAllowed(
    'list_doctors',
    {
      description: 'List doctors, weekly availability, and next available dates. Requires doctor:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    listDoctorsTool(authInfo)
  );

  registerAllowed(
    'get_doctor',
    {
      description: 'Return one doctor and their schedule. Requires doctor:read.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor')
      }),
      annotations: { readOnlyHint: true }
    },
    getDoctorTool(authInfo)
  );

  registerAllowed(
    'add_doctor',
    {
      description: 'Create a doctor record. Requires doctor:create. Admin-only ownership rule.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Doctor name'),
        specialization: z.string().min(1).describe('Doctor specialization'),
        email: z.string().email().optional().describe('Contact email'),
        phone: z.string().optional().describe('Contact phone'),
        availability: z.string().optional().describe('Optional availability notes'),
        weeklyAvailability: weeklyAvailabilitySchema
      })
    },
    addDoctorTool(authInfo)
  );

  registerAllowed(
    'update_doctor',
    {
      description: 'Update a doctor. Requires doctor:update. Doctors may only update themselves.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor'),
        name: z.string().min(1).optional(),
        specialization: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        availability: z.string().optional(),
        weeklyAvailability: weeklyAvailabilitySchema
      })
    },
    updateDoctorTool(authInfo)
  );

  registerAllowed(
    'delete_doctor',
    {
      description: 'Delete a doctor. Requires doctor:delete. Admin only.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor')
      })
    },
    deleteDoctorTool(authInfo)
  );

  registerAllowed(
    'list_patients',
    {
      description: 'List patients visible to the caller. Requires patient:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    listPatientsTool(authInfo)
  );

  registerAllowed(
    'get_patient',
    {
      description: 'Get one patient if the caller is allowed to see them. Requires patient:read.',
      inputSchema: z.object({
        patientId: z.string().min(1)
      }),
      annotations: { readOnlyHint: true }
    },
    getPatientTool(authInfo)
  );

  registerAllowed(
    'add_patient',
    {
      description: 'Create a patient account. Requires patient:create. Admin only.',
      inputSchema: z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        phone: z.string().optional(),
        age: z.number().int().min(0).max(130).optional(),
        gender: z.enum(['male', 'female', 'other']).optional(),
        bio: z.string().optional()
      })
    },
    addPatientTool(authInfo)
  );

  registerAllowed(
    'update_patient',
    {
      description: 'Update a patient. Requires patient:update. Patients may only update themselves.',
      inputSchema: z.object({
        patientId: z.string().min(1),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        age: z.number().int().min(0).max(130).optional(),
        gender: z.enum(['male', 'female', 'other']).optional(),
        bio: z.string().optional()
      })
    },
    updatePatientTool(authInfo)
  );

  registerAllowed(
    'delete_patient',
    {
      description: 'Delete a patient. Requires patient:delete. Admin only.',
      inputSchema: z.object({
        patientId: z.string().min(1)
      })
    },
    deletePatientTool(authInfo)
  );

  registerAllowed(
    'list_appointments',
    {
      description: 'List appointments visible to the caller. Requires appointment:read.',
      inputSchema: z.object({
        status: z.string().optional(),
        doctorId: z.string().optional(),
        patientId: z.string().optional(),
        date: z.string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    listAppointmentsTool(authInfo)
  );

  registerAllowed(
    'request_appointment',
    {
      description: 'Patient requests an appointment on an available date. Requires appointment:create.',
      inputSchema: z.object({
        doctorId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Appointment date YYYY-MM-DD')
      })
    },
    requestAppointmentTool(authInfo)
  );

  registerAllowed(
    'accept_appointment',
    {
      description: 'Doctor accepts one request for a day. Other same-day requests are rejected with alternatives. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      })
    },
    acceptAppointmentTool(authInfo)
  );

  registerAllowed(
    'reject_appointment',
    {
      description: 'Doctor rejects a request and may offer alternative dates. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        reason: z.string().optional(),
        suggestedDates: z.array(z.string()).optional()
      })
    },
    rejectAppointmentTool(authInfo)
  );

  registerAllowed(
    'suggest_alternative_date',
    {
      description: 'Doctor suggests one or more alternative dates. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
        note: z.string().optional()
      })
    },
    suggestAlternativeDateTool(authInfo)
  );

  registerAllowed(
    'accept_alternative_date',
    {
      description: 'Patient accepts a suggested alternative date. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
    },
    acceptAlternativeDateTool(authInfo)
  );

  registerAllowed(
    'cancel_appointment',
    {
      description: 'Cancel an appointment the caller owns. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      })
    },
    cancelAppointmentTool(authInfo)
  );

  registerAllowed(
    'complete_appointment',
    {
      description: 'Mark a confirmed appointment as completed. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      })
    },
    completeAppointmentTool(authInfo)
  );

  registerAllowed(
    'get_my_profile',
    {
      description: 'Return the connected user profile. Requires profile:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    getMyProfileTool(authInfo)
  );

  registerAllowed(
    'update_my_profile',
    {
      description: 'Update the connected user profile. Requires profile:update.',
      inputSchema: z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        age: z.number().int().min(0).max(130).optional(),
        gender: z.enum(['male', 'female', 'other']).optional(),
        bio: z.string().optional(),
        specialization: z.string().optional()
      })
    },
    updateMyProfileTool(authInfo)
  );

  registerAllowed(
    'update_availability',
    {
      description: 'Update weekly availability. Doctors may only update themselves. Requires availability:update.',
      inputSchema: z.object({
        doctorId: z.string().optional().describe('Defaults to the connected doctor'),
        weeklyAvailability: weeklyAvailabilitySchema
      })
    },
    updateAvailabilityTool(authInfo)
  );

  registerAllowed(
    'check_doctor_availability',
    {
      description: 'Check whether a doctor can be booked on a specific date. Requires availability:read.',
      inputSchema: z.object({
        doctorId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date to check YYYY-MM-DD')
      }),
      annotations: { readOnlyHint: true }
    },
    checkDoctorAvailabilityTool(authInfo)
  );

  registerAllowed(
    'get_appointment',
    {
      description: 'Get one appointment if the caller is allowed to see it. Requires appointment:read.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      }),
      annotations: { readOnlyHint: true }
    },
    getAppointmentTool(authInfo)
  );

  registerAllowed(
    'list_my_appointments',
    {
      description: 'List appointments for the connected patient or doctor. Requires appointment:read.',
      inputSchema: z.object({
        status: z.string().optional(),
        date: z.string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    listMyAppointmentsTool(authInfo)
  );

  registerAllowed(
    'list_doctor_appointment_requests',
    {
      description: 'List pending appointment requests for the connected doctor. Requires appointment:read.',
      inputSchema: z.object({
        date: z.string().optional(),
        status: z.string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    listDoctorAppointmentRequestsTool(authInfo)
  );

  registerAllowed(
    'admin_update_appointment',
    {
      description: 'Administrator updates any appointment status, date, or note. Requires appointment:update and admin role.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.string().optional(),
        responseNote: z.string().optional()
      })
    },
    adminUpdateAppointmentTool(authInfo)
  );

  registerAllowed(
    'admin_get_dashboard_stats',
    {
      description: 'Administrator dashboard counts for doctors, patients, and appointments. Requires appointment:read and admin role.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    adminGetDashboardStatsTool(authInfo)
  );

  registerAllowed(
    'search_logs',
    {
      description:
        'Search persisted server logs for debugging OAuth, MCP, API, and database issues. Requires logs:read. Admins can search all logs; other users only see their own activity.',
      inputSchema: z.object({
        requestId: z.string().optional().describe('Filter by correlation/request ID'),
        operation: z.string().optional().describe('Filter by operation name, e.g. mcp.tool.failed'),
        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
        tool: z.string().optional().describe('Filter by MCP tool name'),
        userId: z.string().optional().describe('Admin only: filter by user ID'),
        sinceMinutes: z.number().int().min(1).max(10080).optional().describe('Only logs from the last N minutes'),
        limit: z.number().int().min(1).max(200).optional().describe('Maximum number of log entries to return')
      }),
      annotations: { readOnlyHint: true }
    },
    searchLogsTool(authInfo)
  );

  registerAllowed(
    'get_request_logs',
    {
      description:
        'Return all persisted logs for one requestId in chronological order. Requires logs:read. Use this to trace a single request end-to-end.',
      inputSchema: z.object({
        requestId: z.string().min(1).describe('The x-request-id / correlation ID to trace')
      }),
      annotations: { readOnlyHint: true }
    },
    getRequestLogsTool(authInfo)
  );

  return server;
}
