import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function getDoctorTool(authInfo) {
  return async ({ doctorId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('get_doctor', liveScopes(authInfo, actor));
    const doctor = await doctorService.getDoctorPublic(doctorId);
    return toolResult(doctor);
  };
}
