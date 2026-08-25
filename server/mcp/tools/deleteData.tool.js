import { DataItem } from '../../models/DataItem.js';
import { AppError } from '../../middleware/error.middleware.js';
import { requireScope } from '../../services/permission.service.js';

export function deleteDataTool(authInfo) {
  return async ({ id }) => {
    requireScope(authInfo.scopes, 'delete');
    const item = await DataItem.findOneAndDelete({ _id: id, userId: authInfo.extra.userId });
    if (!item) {
      throw new AppError(404, 'not_found', 'Record not found.');
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ deleted: true, id }, null, 2)
        }
      ]
    };
  };
}
