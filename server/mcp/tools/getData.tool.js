import { DataItem } from '../../models/DataItem.js';
import { requireScope } from '../../services/permission.service.js';

export function getDataTool(authInfo) {
  return async () => {
    requireScope(authInfo.scopes, 'read');
    const items = await DataItem.find({ userId: authInfo.extra.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            items.map((item) => ({
              id: item._id,
              title: item.title,
              content: item.content,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            })),
            null,
            2
          )
        }
      ]
    };
  };
}
