import { User } from '../../models/User.js';
import { AppError } from '../../middleware/error.middleware.js';
import { requireScope } from '../../services/permission.service.js';

export function getProfileTool(authInfo) {
  return async () => {
    requireScope(authInfo.scopes, 'read');
    const user = await User.findById(authInfo.extra.userId).lean();
    if (!user) {
      throw new AppError(401, 'mcp_authentication_required', 'MCP authentication required');
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: user._id,
              name: user.name,
              email: user.email,
              clientId: authInfo.clientId,
              scopes: authInfo.scopes
            },
            null,
            2
          )
        }
      ]
    };
  };
}
