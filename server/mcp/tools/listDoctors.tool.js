import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';

/**
 * list_doctors → requires doctor:read on the access token (granted at Admin consent).
 * authInfo.scopes comes from the Bearer token resolved in mcp/auth.js.
 */
export function listDoctorsTool(authInfo) {
  return async () => {
    assertToolAllowed('list_doctors', authInfo.scopes);
    const doctors = await doctorService.listDoctors();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(doctors.map(doctorService.serializeDoctor), null, 2)
        }
      ]
    };
  };
}