import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';

export function updateDoctorTool(authInfo) {
  return async ({ doctorId, name, specialization }) => {
    assertToolAllowed('update_doctor', authInfo.scopes);
    const doctor = await doctorService.updateDoctor(doctorId, { name, specialization });
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