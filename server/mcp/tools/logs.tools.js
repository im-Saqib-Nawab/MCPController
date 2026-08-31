import { searchLogs } from '../../services/log-store.service.js';
import { assertLogToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function searchLogsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertLogToolAllowed('search_logs', liveScopes(authInfo, actor), actor.role);
    return toolResult(await searchLogs(actor, filters));
  };
}

export function getRequestLogsTool(authInfo) {
  return async ({ requestId }) => {
    const actor = await getActor(authInfo);
    assertLogToolAllowed('get_request_logs', liveScopes(authInfo, actor), actor.role);

    if (!requestId) {
      throw new Error('requestId is required.');
    }

    return toolResult(
      await searchLogs(actor, {
        requestId,
        limit: 200
      })
    );
  };
}
