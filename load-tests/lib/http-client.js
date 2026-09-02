import { config } from '../config.js';

function parseCookiePair(setCookieHeader) {
  const [pair] = String(setCookieHeader).split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  return {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim()
  };
}

export class HttpClient {
  constructor(baseUrl = config.baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookies = new Map();
  }

  getCookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  storeCookies(response) {
    const raw = response.headers.getSetCookie?.() || [];
    const headers = raw.length ? raw : [response.headers.get('set-cookie')].filter(Boolean);
    for (const header of headers) {
      const parsed = parseCookiePair(header);
      if (parsed) {
        this.cookies.set(parsed.name, parsed.value);
      }
    }
  }

  clearCookies() {
    this.cookies.clear();
  }

  async request(method, path, { body, headers = {}, expectStatuses } = {}) {
    const url = `${this.baseUrl}${path}`;
    const started = performance.now();

    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookies.size ? { Cookie: this.getCookieHeader() } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    this.storeCookies(response);

    const durationMs = performance.now() - started;
    const requestId = response.headers.get('x-request-id');
    let data = null;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    } else {
      await response.text().catch(() => null);
    }

    const ok = expectStatuses ? expectStatuses.includes(response.status) : response.ok;

    return {
      ok,
      status: response.status,
      durationMs,
      requestId,
      data,
      headers: response.headers
    };
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  async login(email, password) {
    this.clearCookies();
    return this.post('/api/auth/login', { email, password });
  }

  async me() {
    return this.get('/api/auth/me');
  }
}
