import * as doctorService from '../../services/doctor.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';

export function addDoctorTool(authInfo) {
  return async ({ name, specialization }) => {
    assertToolAllowed('add_doctor', authInfo.scopes);
    const doctor = await doctorService.addDoctor({ name, specialization });
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