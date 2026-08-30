import { User } from '../models/User.js';
import { AppError } from '../middleware/error.middleware.js';
import { getEffectiveAllowedScopes } from '../services/auth.service.js';
import { hasScope } from '../services/permission.service.js';

export async function getActor(authInfo) {
  const userId = authInfo?.extra?.userId;
  if (!userId) {
    throw new AppError(401, 'invalid_token', 'MCP token is not bound to a user.');
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError(401, 'invalid_token', 'The user for this token no longer exists.');
  }

  return user;
}

export function liveScopes(authInfo, user) {
  const granted = Array.isArray(authInfo?.scopes) ? authInfo.scopes : [];
  const allowed = getEffectiveAllowedScopes(user);
  return granted.filter((scope) => hasScope(allowed, scope));
}

export function toolResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
  };
}
