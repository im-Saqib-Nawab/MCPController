import { DataItem } from '../../models/DataItem.js';
import { requireScope } from '../../services/permission.service.js';

export function createDataTool(authInfo) {
  return async ({ title, content }) => {
    requireScope(authInfo.scopes, 'write');
    const item = await DataItem.create({
      userId: authInfo.extra.userId,
      title,
      content: content || ''
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { id: item._id, title: item.title, content: item.content },
            null,
            2
          )
        }
      ]
    };
  };
}
