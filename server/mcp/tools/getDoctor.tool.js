import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';

export function getDoctorTool(authInfo) {
  return async ({ doctorId }) => {
    assertToolAllowed('get_doctor', authInfo.scopes);
    const doctor = await doctorService.getDoctor(doctorId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(doctorService.serializeDoctor(doctor), null, 2)
        }
      ]
    };
  };
}