// Fetch wrapper for /api. Same single-flight refresh as lib/api-client.ts, but with the
// hrms_* cookies (set by the API, sent with credentials: 'include').

const V1_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_HRMS_API_URL ?? V1_BASE.replace(/\/api\/v1\/?$/, '/api')
).replace(/\/$/, '');

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh';
export const HRMS_LOGIN_ROUTE = '/login';

export class HrmsApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HrmsApiError';
    this.status = status;
    this.code = code;
  }
}

export interface HrmsFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuthRefresh?: boolean;
}

interface ErrorBody {
  message?: string | string[];
  error?: string;
  code?: string;
}

async function parseError(response: Response): Promise<HrmsApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }
  const raw = body?.message ?? body?.error;
  const message = Array.isArray(raw) ? raw.join(', ') : raw;
  return new HrmsApiError(
    response.status,
    message || response.statusText || `Request failed with status ${response.status}`,
    body?.code,
  );
}

// A full page load, so every cached query and the auth state start clean.
function redirectTo(path: string): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === path) return;
  window.location.assign(path);
}

function redirectToLogin(): void {
  redirectTo(HRMS_LOGIN_ROUTE);
}

let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshPromise ??= fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw await parseError(response);
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function send(path: string, options: HrmsFetchOptions, isRetry: boolean): Promise<Response> {
  const { body, skipAuthRefresh, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...rest,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const canRefresh = !skipAuthRefresh && path !== LOGIN_PATH && path !== REFRESH_PATH;
  if (response.status === 401 && canRefresh) {
    if (isRetry) {
      redirectToLogin();
      throw await parseError(response);
    }
    try {
      await refreshSession();
    } catch {
      redirectToLogin();
      throw await parseError(response);
    }
    return send(path, options, true);
  }

  if (!response.ok) {
    const error = await parseError(response);
    // The membership was deactivated or its org blocked: this session is over.
    if (response.status === 403 && error.code === 'MEMBERSHIP_INACTIVE') redirectToLogin();
    throw error;
  }
  return response;
}

export async function hrmsFetch<T>(path: string, options: HrmsFetchOptions = {}): Promise<T> {
  const response = await send(path, options, false);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** For file responses such as the CSV report. */
export async function hrmsFetchText(path: string): Promise<string> {
  const response = await send(path, {}, false);
  return response.text();
}
