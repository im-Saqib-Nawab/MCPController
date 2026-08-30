import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { config } from '../config/env.js';
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
  completeAppointmentTool
} from './tools/appointment.tools.js';
import { getMyProfileTool, updateMyProfileTool, updateAvailabilityTool } from './tools/profile.tools.js';

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
      'Doctor-patient appointment MCP. Tools enforce the caller role and granted OAuth scopes. Doctors can only change their own profile and appointments. Patients can only manage their own appointments. Admins can manage the full system.'
  });

  server.registerTool(
    'list_doctors',
    {
      description: 'List doctors, weekly availability, and next available dates. Requires doctor:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    wrap(listDoctorsTool(authInfo))
  );

  server.registerTool(
    'get_doctor',
    {
      description: 'Return one doctor and their schedule. Requires doctor:read.',
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
    wrap(addDoctorTool(authInfo))
  );

  server.registerTool(
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
    wrap(updateDoctorTool(authInfo))
  );

  server.registerTool(
    'delete_doctor',
    {
      description: 'Delete a doctor. Requires doctor:delete. Admin only.',
      inputSchema: z.object({
        doctorId: z.string().min(1).describe('MongoDB id of the doctor')
      })
    },
    wrap(deleteDoctorTool(authInfo))
  );

  server.registerTool(
    'list_patients',
    {
      description: 'List patients visible to the caller. Requires patient:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    wrap(listPatientsTool(authInfo))
  );

  server.registerTool(
    'get_patient',
    {
      description: 'Get one patient if the caller is allowed to see them. Requires patient:read.',
      inputSchema: z.object({
        patientId: z.string().min(1)
      }),
      annotations: { readOnlyHint: true }
    },
    wrap(getPatientTool(authInfo))
  );

  server.registerTool(
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
    wrap(addPatientTool(authInfo))
  );

  server.registerTool(
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
    wrap(updatePatientTool(authInfo))
  );

  server.registerTool(
    'delete_patient',
    {
      description: 'Delete a patient. Requires patient:delete. Admin only.',
      inputSchema: z.object({
        patientId: z.string().min(1)
      })
    },
    wrap(deletePatientTool(authInfo))
  );

  server.registerTool(
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
    wrap(listAppointmentsTool(authInfo))
  );

  server.registerTool(
    'request_appointment',
    {
      description: 'Patient requests an appointment on an available date. Requires appointment:create.',
      inputSchema: z.object({
        doctorId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Appointment date YYYY-MM-DD')
      })
    },
    wrap(requestAppointmentTool(authInfo))
  );

  server.registerTool(
    'accept_appointment',
    {
      description: 'Doctor accepts one request for a day. Other same-day requests are rejected with alternatives. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      })
    },
    wrap(acceptAppointmentTool(authInfo))
  );

  server.registerTool(
    'reject_appointment',
    {
      description: 'Doctor rejects a request and may offer alternative dates. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        reason: z.string().optional(),
        suggestedDates: z.array(z.string()).optional()
      })
    },
    wrap(rejectAppointmentTool(authInfo))
  );

  server.registerTool(
    'suggest_alternative_date',
    {
      description: 'Doctor suggests one or more alternative dates. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
        note: z.string().optional()
      })
    },
    wrap(suggestAlternativeDateTool(authInfo))
  );

  server.registerTool(
    'accept_alternative_date',
    {
      description: 'Patient accepts a suggested alternative date. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
    },
    wrap(acceptAlternativeDateTool(authInfo))
  );

  server.registerTool(
    'cancel_appointment',
    {
      description: 'Cancel an appointment the caller owns. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      })
    },
    wrap(cancelAppointmentTool(authInfo))
  );

  server.registerTool(
    'complete_appointment',
    {
      description: 'Mark a confirmed appointment as completed. Requires appointment:update.',
      inputSchema: z.object({
        appointmentId: z.string().min(1)
      })
    },
    wrap(completeAppointmentTool(authInfo))
  );

  server.registerTool(
    'get_my_profile',
    {
      description: 'Return the connected user profile. Requires profile:read.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    wrap(getMyProfileTool(authInfo))
  );

  server.registerTool(
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
    wrap(updateMyProfileTool(authInfo))
  );

  server.registerTool(
    'update_availability',
    {
      description: 'Update weekly availability. Doctors may only update themselves. Requires availability:update.',
      inputSchema: z.object({
        doctorId: z.string().optional().describe('Defaults to the connected doctor'),
        weeklyAvailability: weeklyAvailabilitySchema
      })
    },
    wrap(updateAvailabilityTool(authInfo))
  );

  return server;
}
