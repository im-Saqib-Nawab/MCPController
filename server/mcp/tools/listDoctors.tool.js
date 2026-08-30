import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function listDoctorsTool(authInfo) {
  return async () => {
    const actor = await getActor(authInfo);
    assertToolAllowed('list_doctors', liveScopes(authInfo, actor));
    const doctors = await doctorService.listDoctorsPublic();
    return toolResult(doctors);
  };
}
