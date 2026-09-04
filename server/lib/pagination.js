export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * Parse page/limit from query params.
 * Always applies a default limit so list endpoints never return unbounded data.
 */
export function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? ''), 10) || DEFAULT_PAGE);
  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit ?? ''), 10) || defaultLimit, 1),
    maxLimit
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    hasExplicitPagination: query.page !== undefined || query.limit !== undefined
  };
}

export function buildPaginationMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages
  };
}

/**
 * Run a paginated Mongoose find + countDocuments in parallel.
 */
export async function paginateQuery(model, filter, options = {}) {
  const { sort, lean = true, select, pagination: paginationInput = {} } = options;
  const { page, limit, skip } = parsePagination(paginationInput, options);

  let findQuery = model.find(filter);
  if (select) findQuery = findQuery.select(select);
  if (sort) findQuery = findQuery.sort(sort);
  if (lean) findQuery = findQuery.lean();
  findQuery = findQuery.skip(skip).limit(limit);

  const [total, items] = await Promise.all([model.countDocuments(filter), findQuery]);

  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total })
  };
}
