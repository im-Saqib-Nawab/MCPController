import { DataItem } from '../../models/DataItem.js';
import { AppError } from '../../middleware/error.middleware.js';
import { requireScope } from '../../services/permission.service.js';

export function updateDataTool(authInfo) {
  return async ({ id, title, content }) => {
    requireScope(authInfo.scopes, 'write');
    const item = await DataItem.findOne({ _id: id, userId: authInfo.extra.userId });
    if (!item) {
      throw new AppError(404, 'not_found', 'Record not found.');
    }
    if (title !== undefined) item.title = title;
    if (content !== undefined) item.content = content;
    await item.save();
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
