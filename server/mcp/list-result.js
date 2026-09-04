/**
 * MCP list tools return bare arrays by default for backward compatibility.
 * When page/limit are provided, return the full paginated payload.
 */
export function mcpListPayload(result, itemKey, filters = {}) {
  const hasPagination = filters.page !== undefined || filters.limit !== undefined;
  return hasPagination ? result : result[itemKey];
}
