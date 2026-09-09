/**
 * Shared helpers for matching SLO endpoint/method patterns to recorded routes.
 */

export function normalizeSloEndpoint(endpoint = '') {
  const value = String(endpoint || '').trim();
  if (!value || value === '*' || value === '/*' || value.toLowerCase() === 'all') {
    return '*';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

export function normalizeSloMethod(method = '*') {
  const value = String(method || '*').trim().toUpperCase();
  return value || '*';
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isWildcardEndpoint(endpoint = '') {
  return normalizeSloEndpoint(endpoint) === '*';
}

export function isWildcardMethod(method = '*') {
  return normalizeSloMethod(method) === '*';
}

export function formatSloEndpointLabel(endpoint = '*') {
  return isWildcardEndpoint(endpoint) ? 'All endpoints' : normalizeSloEndpoint(endpoint);
}

export function formatSloMethodLabel(method = '*') {
  return isWildcardMethod(method) ? 'All methods' : normalizeSloMethod(method);
}

/**
 * Returns true when a recorded route/method matches an SLO pattern.
 */
export function routeMatchesSlo(route = '', method = '', sloEndpoint = '*', sloMethod = '*') {
  const normalizedRoute = String(route || '');
  const normalizedMethod = String(method || '').toUpperCase();
  const endpointPattern = normalizeSloEndpoint(sloEndpoint);
  const methodPattern = normalizeSloMethod(sloMethod);

  const methodMatches = methodPattern === '*' || normalizedMethod === methodPattern;
  if (!methodMatches) {
    return false;
  }

  if (endpointPattern === '*') {
    return true;
  }

  return normalizedRoute === endpointPattern || normalizedRoute.startsWith(`${endpointPattern}/`);
}

/**
 * MongoDB filter for RequestLatencySample / LatencyMinuteBucket queries.
 */
export function buildSloRouteFilter(endpoint = '*') {
  const normalized = normalizeSloEndpoint(endpoint);
  if (normalized === '*') {
    return {};
  }

  return {
    route: {
      $regex: `^${escapeRegex(normalized)}($|/)`
    }
  };
}

export function buildSloMethodFilter(method = '*') {
  const normalized = normalizeSloMethod(method);
  if (normalized === '*') {
    return {};
  }

  return { method: normalized };
}

export function buildSloMatch(endpoint = '*', method = '*') {
  return {
    ...buildSloRouteFilter(endpoint),
    ...buildSloMethodFilter(method)
  };
}
