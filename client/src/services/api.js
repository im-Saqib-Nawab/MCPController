import axios from 'axios';

/**
 * The React app never receives JWT_SECRET, MongoDB URIs, or OAuth client secrets.
 * It talks to same-origin /api routes. Vite proxies them in development; Express
 * serves them in production.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

export function getErrorMessage(error) {
  return error.response?.data?.message || error.response?.data?.error_description || error.message;
}
