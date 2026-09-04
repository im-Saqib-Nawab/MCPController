import * as patientService from '../../services/patient.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';
import { mcpListPayload } from '../list-result.js';

export function listPatientsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('list_patients', liveScopes(authInfo, actor));
    const result = await patientService.listPatients(actor, filters);
    return toolResult(mcpListPayload(result, 'patients', filters));
  };
}

export function getPatientTool(authInfo) {
  return async ({ patientId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('get_patient', liveScopes(authInfo, actor));
    return toolResult(await patientService.getPatient(patientId, actor));
  };
}

export function addPatientTool(authInfo) {
  return async (fields) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('add_patient', liveScopes(authInfo, actor));
    return toolResult(await patientService.addPatient(fields, actor));
  };
}

export function updatePatientTool(authInfo) {
  return async ({ patientId, ...fields }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('update_patient', liveScopes(authInfo, actor));
    return toolResult(await patientService.updatePatient(patientId, fields, actor));
  };
}

export function deletePatientTool(authInfo) {
  return async ({ patientId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('delete_patient', liveScopes(authInfo, actor));
    return toolResult(await patientService.deletePatient(patientId, actor));
  };
}
