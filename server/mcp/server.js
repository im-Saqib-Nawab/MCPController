import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { config } from '../config/env.js';
import { logError, logOperation, getRequestContext } from '../lib/request-context.js';
import { logAudit, mcpActionLabel } from '../lib/audit-log.js';
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
import {
  getCreditBalanceTool,
  listSubscriptionPlansTool,
  getCreditUsageSummaryTool,
  getPurchaseLinkTool,
  explainCreditsTool,
  continuePreviousTaskTool
} from './tools/credit.tools.js';
import { isToolExposed } from '../services/permission.service.js';
import { User } from '../models/User.js';
import {
  getToolCreditCost,
  deductCredits,
  logAdminBypass,
  checkCreditConfirmation,
  buildInsufficientCreditsPayload,
  buildConfirmationPayload,
  InsufficientCreditsError,
  CreditConfirmationRequiredError
} from '../services/credit.service.js';
import * as mcpSessionService from '../services/mcp-session.service.js';

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
      name: authInfo?.extra?.actorName,
      role: authInfo?.extra?.role,
      clientId: authInfo?.clientId
    };
    const action = mcpActionLabel(toolName);
    const requestId = getRequestContext()?.requestId || '';
    const cost = getToolCreditCost(toolName);
    const isAdminUser = actor.role === 'admin';

    logOperation('info', 'mcp.tool.started', { tool: toolName, creditCost: cost, ...actor });

    try {
      // Credit pre-check (after auth, before execution)
      if (!isAdminUser && cost > 0) {
        const user = await User.findById(actor.userId).select('creditBalance role').lean();
        const balance = user?.creditBalance ?? 0;

        const confirmationError = checkCreditConfirmation(toolName, cost, balance, args || {});
        if (confirmationError instanceof CreditConfirmationRequiredError) {
          const payload = buildConfirmationPayload(confirmationError);
          return {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            isError: true
          };
        }
        if (confirmationError instanceof InsufficientCreditsError) {
          const session = await mcpSessionService.setPendingStep({
            userId: actor.userId,
            clientId: actor.clientId,
            tool: toolName,
            args: args || {}
          });
          const payload = buildInsufficientCreditsPayload(confirmationError, session);
          return {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            isError: true
          };
        }
      }

      const result = await handler(args || {});
      const durationMs = Date.now() - start;
      const failed = Boolean(result?.isError);

      // Deduct credits only on successful execution
      let creditInfo = null;
      if (!failed) {
        if (isAdminUser) {
          await logAdminBypass({ userId: actor.userId, tool: toolName, requestId });
          creditInfo = { charged: 0, balance: null, bypass: 'admin' };
        } else if (cost > 0) {
          const idempotencyKey = args?.idempotencyKey
            ? `${toolName}:${args.idempotencyKey}`
            : '';
          const deduction = await deductCredits({
            userId: actor.userId,
            amount: cost,
            tool: toolName,
            action,
            requestId,
            idempotencyKey,
            description: `${action} via MCP`
          });
          creditInfo = {
            charged: deduction.deducted,
            balance: deduction.balance,
            duplicate: deduction.duplicate
          };

          await mcpSessionService.recordCompletedStep({
            userId: actor.userId,
            clientId: actor.clientId,
            tool: toolName,
            summary: action,
            creditsUsed: cost
          });
        } else {
          creditInfo = { charged: 0, balance: await User.findById(actor.userId).select('creditBalance').lean().then((u) => u?.creditBalance ?? 0) };
        }
      }

      logOperation(failed ? 'warn' : 'info', failed ? 'mcp.tool.failed' : 'mcp.tool.completed', {
        tool: toolName,
        durationMs,
        success: !failed,
        creditCost: cost,
        creditsCharged: creditInfo?.charged ?? 0,
        ...actor
      });

      logAudit(
        {
          _id: actor.userId,
          id: actor.userId,
          name: actor.name,
          role: actor.role
        },
        action, {
        status: failed ? 'error' : 'success',
        level: failed ? 'warn' : 'info',
        tool: toolName,
        durationMs,
        creditsCharged: creditInfo?.charged ?? 0
      });

      // Append credit info to successful responses
      if (!failed && creditInfo && result?.content?.[0]?.type === 'text') {
        try {
          const parsed = JSON.parse(result.content[0].text);
          if (Array.isArray(parsed)) {
            result.content[0].text = JSON.stringify({ data: parsed, credits: creditInfo }, null, 2);
          } else {
            parsed.credits = creditInfo;
            if (creditInfo.balance !== null && creditInfo.balance <= 10) {
              parsed.creditWarning =
                creditInfo.balance === 0
                  ? 'Credits exhausted. Purchase a plan to continue.'
                  : `Low credits: ${creditInfo.balance} remaining.`;
            }
            result.content[0].text = JSON.stringify(parsed, null, 2);
          }
        } catch {
          // Non-JSON tool response — wrap with credit metadata
          result.content[0].text = JSON.stringify(
            { data: result.content[0].text, credits: creditInfo },
            null,
            2
          );
        }
      }

      return result;
    } catch (err) {
      // Do not deduct credits on thrown errors (validation, permission, DB failures)
      if (err instanceof InsufficientCreditsError) {
        const session = await mcpSessionService.setPendingStep({
          userId: actor.userId,
          clientId: actor.clientId,
          tool: toolName,
          args: args || {}
        });
        const payload = buildInsufficientCreditsPayload(err, session);
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          isError: true
        };
      }

      logError(err, {
        operation: 'mcp.tool.error',
        tool: toolName,
        durationMs: Date.now() - start,
        ...actor
      });
      logAudit(
        {
          _id: actor.userId,
          id: actor.userId,
          name: actor.name,
          role: actor.role
        },
        action, {
        status: 'error',
        level: 'warn',
        tool: toolName,
        durationMs: Date.now() - start
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
  const role = authInfo?.extra?.role;

  const server = new McpServer({
    name: config.mcpServerName,
    version: config.mcpServerVersion,
    instructions:
      'Doctor-patient appointment MCP for the full clinic system. Roles: admin (manage everything, no credit charges), doctor (own profile, availability, appointment requests), patient (browse doctors, book appointments). Credits: each tool consumes credits (see explain_credits). Multi-step tasks check credits per step — if credits run out, completed steps are preserved; use continue_previous_task after purchasing. Free tools: get_credit_balance, list_subscription_plans, explain_credits, get_purchase_link. Expensive operations may require confirm: true. Appointment statuses: REQUESTED, ACCEPTED, REJECTED, ALTERNATIVE_OFFERED, CANCELLED, COMPLETED.'
  });

  function registerAllowed(toolName, definition, handler) {
    if (!isToolExposed(toolName, grantedScopes, role)) {
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
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Appointment date YYYY-MM-DD'),
        confirm: z.boolean().optional().describe('Set true to confirm when this uses most of your remaining credits'),
        idempotencyKey: z.string().optional().describe('Optional idempotency key to prevent duplicate bookings')
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
        'Search persisted server logs for debugging OAuth, MCP, API, and database issues. Administrator only.',
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
        'Return all persisted logs for one requestId in chronological order. Administrator only. Use this to trace a single request end-to-end.',
      inputSchema: z.object({
        requestId: z.string().min(1).describe('The x-request-id / correlation ID to trace')
      }),
      annotations: { readOnlyHint: true }
    },
    getRequestLogsTool(authInfo)
  );

  registerAllowed(
    'get_credit_balance',
    {
      description: 'Return current credit balance, usage this month, and subscription status. Free — no credits consumed.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    getCreditBalanceTool(authInfo)
  );

  registerAllowed(
    'list_subscription_plans',
    {
      description: 'List available subscription plans with pricing and credits. Free — no credits consumed.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    listSubscriptionPlansTool(authInfo)
  );

  registerAllowed(
    'get_credit_usage_summary',
    {
      description: 'Return credit usage summary and recent transactions. Free — no credits consumed.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    getCreditUsageSummaryTool(authInfo)
  );

  registerAllowed(
    'get_purchase_link',
    {
      description: 'Get a link to purchase a subscription plan and add credits. Free — no credits consumed.',
      inputSchema: z.object({
        planId: z.enum(['monthly', 'yearly']).optional().describe('Plan to purchase (default: monthly)')
      }),
      annotations: { readOnlyHint: true }
    },
    getPurchaseLinkTool(authInfo)
  );

  registerAllowed(
    'explain_credits',
    {
      description: 'Explain how the credit system works and list tool costs. Free — no credits consumed.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    explainCreditsTool(authInfo)
  );

  registerAllowed(
    'continue_previous_task',
    {
      description:
        'Continue a multi-step task that stopped due to insufficient credits. Free — returns pending step info after purchasing credits.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    continuePreviousTaskTool(authInfo)
  );

  return server;
}
