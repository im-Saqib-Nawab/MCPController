import { assertToolAllowed } from '../../services/permission.service.js';
import { deleteDoctor } from '../../services/doctor.service.js';

/**
 * delete_doctor → requires doctor:delete.
 * If Admin only granted read/write, this throws Permission denied before MongoDB is touched.
 */
export function deleteDoctorTool(authInfo) {
  return async ({ doctorId }) => {
    assertToolAllowed('delete_doctor', authInfo.scopes);
    await deleteDoctor(doctorId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ deleted: true, doctorId }, null, 2)
        }
      ]
    };
  };
}