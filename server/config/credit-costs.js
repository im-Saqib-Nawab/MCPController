/**
 * Centralized MCP tool credit costs.
 * Change costs here — do not scatter numbers across tools or controllers.
 *
 * Cost tiers:
 *   0  = free (informational / account tools)
 *   1  = simple read/list
 *   2  = detailed read / search
 *   3–5 = updates / moderate writes
 *   10+ = high-impact operations (booking, admin mutations)
 */

export const CREDIT_COSTS = {
  // Free informational tools
  get_credit_balance: 0,
  list_subscription_plans: 0,
  get_credit_usage_summary: 0,
  get_purchase_link: 0,
  explain_credits: 0,
  continue_previous_task: 0,

  // Doctor reads
  list_doctors: 1,
  get_doctor: 2,
  check_doctor_availability: 1,

  // Doctor writes
  add_doctor: 5,
  update_doctor: 5,
  delete_doctor: 5,
  update_availability: 3,

  // Patient reads
  list_patients: 1,
  get_patient: 2,

  // Patient writes
  add_patient: 5,
  update_patient: 3,
  delete_patient: 5,

  // Appointment reads
  list_appointments: 1,
  get_appointment: 2,
  list_my_appointments: 1,
  list_doctor_appointment_requests: 1,

  // Appointment writes
  request_appointment: 10,
  accept_appointment: 3,
  reject_appointment: 2,
  suggest_alternative_date: 2,
  accept_alternative_date: 3,
  cancel_appointment: 2,
  complete_appointment: 2,
  admin_update_appointment: 5,

  // Profile
  get_my_profile: 0,
  update_my_profile: 2,

  // Admin reads (still logged; admin bypasses deduction)
  admin_get_dashboard_stats: 0,
  search_logs: 0,
  get_request_logs: 0
};

/** Tools that never consume credits (alias for cost === 0). */
export const FREE_TOOLS = new Set(
  Object.entries(CREDIT_COSTS)
    .filter(([, cost]) => cost === 0)
    .map(([name]) => name)
);

export function getToolCreditCost(toolName) {
  if (Object.prototype.hasOwnProperty.call(CREDIT_COSTS, toolName)) {
    return CREDIT_COSTS[toolName];
  }
  return 1;
}

export function isFreeTool(toolName) {
  return FREE_TOOLS.has(toolName);
}

/** Operations that deplete the user's entire balance warrant confirmation. */
export const EXPENSIVE_TOOL_THRESHOLD = 5;
