import { searchLogs } from '../../services/log-store.service.js';
import { assertToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

export function searchLogsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('search_logs', liveScopes(authInfo, actor));
    return toolResult(await searchLogs(actor, filters));
  };
}

export function getRequestLogsTool(authInfo) {
  return async ({ requestId }) => {
    const actor = await getActor(authInfo);
    assertToolAllowed('get_request_logs', liveScopes(authInfo, actor));

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
