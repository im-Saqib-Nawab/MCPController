import { assertToolAllowed } from '../../services/permission.service.js';
import { deleteDoctor } from '../../services/doctor.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function deleteDoctorTool(authInfo) {
  return async ({ doctorId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('delete_doctor', liveScopes(authInfo, actor));
    await deleteDoctor(doctorId, actor);
    return toolResult({ deleted: true, doctorId });
  };
}
