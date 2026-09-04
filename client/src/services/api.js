import axios from 'axios';

function readCsrfToken() {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(/(?:^|;\s*)mcpcontroller_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/*
 * The browser only talks to the public API paths.
 *
 * Development:
 *   Vite -> /api -> Express
 *
 * Production:
 *   Express serves both React and /api from the same origin.
 *
 * Secrets such as JWT_SECRET, MONGODB_URI and ADMIN_PASSWORD
 * must NEVER be exposed here.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    Accept: 'application/json'
  }
});

api.interceptors.request.use((requestConfig) => {
  const method = String(requestConfig.method || 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      requestConfig.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return requestConfig;
});

export function getErrorMessage(error) {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.response?.data?.error_description) {
    return error.response.data.error_description;
  }

  if (error?.response?.data?.error) {
    return error.response.data.error;
  }

  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}