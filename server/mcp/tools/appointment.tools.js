import * as appointmentService from '../../services/appointment.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function listAppointmentsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('list_appointments', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.listAppointments(actor, filters));
  };
}

export function requestAppointmentTool(authInfo) {
  return async ({ doctorId, date }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('request_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.requestAppointment(actor, { doctorId, date }));
  };
}

export function acceptAppointmentTool(authInfo) {
  return async ({ appointmentId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('accept_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.acceptAppointment(appointmentId, actor));
  };
}

export function rejectAppointmentTool(authInfo) {
  return async ({ appointmentId, reason, suggestedDates }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('reject_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.rejectAppointment(appointmentId, actor, { reason, suggestedDates }));
  };
}

export function suggestAlternativeDateTool(authInfo) {
  return async ({ appointmentId, dates, note }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('suggest_alternative_date', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.suggestAlternativeDate(appointmentId, actor, { dates, note }));
  };
}

export function acceptAlternativeDateTool(authInfo) {
  return async ({ appointmentId, date }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('accept_alternative_date', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.acceptAlternativeDate(appointmentId, actor, { date }));
  };
}

export function cancelAppointmentTool(authInfo) {
  return async ({ appointmentId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('cancel_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.cancelAppointment(appointmentId, actor));
  };
}

export function completeAppointmentTool(authInfo) {
  return async ({ appointmentId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('complete_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.completeAppointment(appointmentId, actor));
  };
}

export function getAppointmentTool(authInfo) {
  return async ({ appointmentId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('get_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.getAppointment(appointmentId, actor));
  };
}

export function listMyAppointmentsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('list_my_appointments', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.listMyAppointments(actor, filters));
  };
}

export function listDoctorAppointmentRequestsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('list_doctor_appointment_requests', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.listDoctorAppointmentRequests(actor, filters));
  };
}

export function adminUpdateAppointmentTool(authInfo) {
  return async ({ appointmentId, ...fields }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('admin_update_appointment', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.adminUpdateAppointment(appointmentId, fields, actor));
  };
}

export function adminGetDashboardStatsTool(authInfo) {
  return async () => {
    const actor = await getActor(authInfo);
    assertToolAllowed('admin_get_dashboard_stats', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.adminDashboardStats(actor));
  };
}
