import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function updateDoctorTool(authInfo) {
  return async ({ doctorId, name, specialization, email, phone, availability, weeklyAvailability }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('update_doctor', liveScopes(authInfo, actor));
    const doctor = await doctorService.updateDoctor(
      doctorId,
      { name, specialization, email, phone, availability, weeklyAvailability },
      actor
    );
    return toolResult(doctorService.serializeDoctor(doctor));
  };
}
