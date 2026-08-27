import axios from 'axios';

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