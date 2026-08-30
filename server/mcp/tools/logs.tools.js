import { searchLogs } from '../../services/log-store.service.js';
import { assertLogToolAllowed } from '../../services/permission.service.js';
import { getActor, liveScopes, toolResult } from '../actor.js';

function effectiveScopesFor(authInfo, actor) {
  return Array.isArray(authInfo?.extra?.effectiveScopes)
    ? authInfo.extra.effectiveScopes
    : liveScopes(authInfo, actor);
}

export function searchLogsTool(authInfo) {
  return async (filters = {}) => {
    const actor = await getActor(authInfo);
    assertLogToolAllowed(
      'search_logs',
      liveScopes(authInfo, actor),
      actor.role,
      effectiveScopesFor(authInfo, actor)
    );
    return toolResult(await searchLogs(actor, filters));
  };
}

export function getRequestLogsTool(authInfo) {
  return async ({ requestId }) => {
    const actor = await getActor(authInfo);
    assertLogToolAllowed(
      'get_request_logs',
      liveScopes(authInfo, actor),
      actor.role,
      effectiveScopesFor(authInfo, actor)
    );

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
