import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function addDoctorTool(authInfo) {
  return async ({ name, specialization, email, phone, availability, weeklyAvailability }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('add_doctor', liveScopes(authInfo, actor));
    const doctor = await doctorService.addDoctor(
      { name, specialization, email, phone, availability, weeklyAvailability },
      actor
    );
    return toolResult(doctorService.serializeDoctor(doctor));
  };
}
