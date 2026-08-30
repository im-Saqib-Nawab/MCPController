import * as appointmentService from '../../services/appointment.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function checkDoctorAvailabilityTool(authInfo) {
  return async ({ doctorId, date }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('check_doctor_availability', liveScopes(authInfo, actor));
    return toolResult(await appointmentService.checkDoctorAvailability(doctorId, date));
  };
}
