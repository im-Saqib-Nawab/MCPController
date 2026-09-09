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
let unauthorizedHandler = null;

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
  headers: {
    Accept: 'application/json'
  }
});

api.setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};

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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    const isAuthMe = url.endsWith('/auth/me') || url.includes('/auth/me?');

    if (status === 401 && !isAuthMe) {
      unauthorizedHandler?.();
    }

    return Promise.reject(error);
  }
);

function readApiErrorPayload(error) {
  const data = error?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data.split('\n')[0].trim();
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  if (typeof data.message === 'string') {
    return data.message;
  }

  if (data.message && typeof data.message === 'object' && typeof data.message.message === 'string') {
    return data.message.message;
  }

  if (typeof data.error_description === 'string') {
    return data.error_description;
  }

  if (typeof data.error === 'string') {
    return data.error;
  }

  if (data.error && typeof data.error === 'object' && typeof data.error.message === 'string') {
    return data.error.message;
  }

  return null;
}

export function getErrorMessage(error) {
  const apiMessage = readApiErrorPayload(error);
  if (apiMessage) {
    return apiMessage;
  }

  if (error?.response?.data?.error === 'use_public_entrypoint' && error?.response?.data?.publicUrl) {
    return `Use ${error.response.data.publicUrl} instead of this preview URL.`;
  }

  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}