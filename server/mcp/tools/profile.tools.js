import * as doctorService from '../../services/doctor.service.js';
import { serializeUserWithProfile, updateOwnProfile } from '../../services/auth.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function getMyProfileTool(authInfo) {
  return async () => {
    const actor = await getActor(authInfo);
    assertToolAllowed('get_my_profile', liveScopes(authInfo, actor));
    return toolResult(await serializeUserWithProfile(actor));
  };
}

export function updateMyProfileTool(authInfo) {
  return async (fields) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('update_my_profile', liveScopes(authInfo, actor));
    return toolResult(await updateOwnProfile(actor._id, fields));
  };
}

export function updateAvailabilityTool(authInfo) {
  return async ({ doctorId, weeklyAvailability }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('update_availability', liveScopes(authInfo, actor));
    const targetId = doctorId || (await doctorService.getDoctorByUserId(actor._id))?._id;
    if (!targetId) {
      throw new Error('Doctor profile not found.');
    }
    const doctor = await doctorService.updateAvailability(String(targetId), weeklyAvailability, actor);
    return toolResult(doctorService.serializeDoctor(doctor));
  };
}
