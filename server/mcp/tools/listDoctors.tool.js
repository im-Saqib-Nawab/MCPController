import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';
import { mcpListPayload } from '../list-result.js';

export function listDoctorsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('list_doctors', liveScopes(authInfo, actor));
    const result = await doctorService.listDoctorsPublic(filters);
    return toolResult(mcpListPayload(result, 'doctors', filters));
  };
}
