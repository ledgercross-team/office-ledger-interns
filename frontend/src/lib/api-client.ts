import type { AuthSession } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh';
const LOGIN_ROUTE = '/login';
const CHANGE_PASSWORD_ROUTE = '/change-password';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuthRefresh?: boolean;
}

interface ErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function normalizeMessage(body: ErrorBody | null, response: Response): string {
  if (body) {
    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }
    if (typeof body.message === 'string' && body.message) {
      return body.message;
    }
    if (typeof body.error === 'string' && body.error) {
      return body.error;
    }
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }
  return new ApiError(response.status, normalizeMessage(body, response), body?.code);
}

function redirectTo(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  // The v1 session wraps every page (see app/layout.tsx), including the HRMS
  // screens which authenticate with hrms_* cookies only. A hard reload to the
  // login page from there fights proxy.ts (/login with hrms tokens redirects
  // back to /) and reloads forever, so on HRMS routes just throw instead.
  if (isHrmsPath(window.location.pathname)) {
    return;
  }
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) {
    return;
  }
  window.location.assign(path);
}

// Same route set as proxy.ts and the rewrites in next.config.ts.
const HRMS_ROUTE_ROOTS = [
  '/',
  '/login',
  '/accept-invite',
  '/change-password',
  '/attendance',
  '/calendar',
  '/history',
  '/invites',
  '/leave',
  '/notifications',
  '/people',
  '/performance',
  '/platform',
  '/projects',
  '/ratings',
  '/requests',
  '/settings',
  '/tasks',
  '/workload',
];

function isHrmsPath(pathname: string): boolean {
  if (pathname === '/hrms' || pathname.startsWith('/hrms/')) return true;
  return HRMS_ROUTE_ROOTS.some((root) =>
    root === '/' ? pathname === '/' : pathname === root || pathname.startsWith(root + '/'),
  );
}

let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const response = await fetch(buildUrl(REFRESH_PATH), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw await parseError(response);
  }
}

function getRefreshPromise(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function sendRequest(
  path: string,
  options: ApiFetchOptions,
  isRetry: boolean,
): Promise<Response> {
  const { body, skipAuthRefresh, headers, ...rest } = options;
  const response = await fetch(buildUrl(path), {
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
      redirectTo(LOGIN_ROUTE);
      throw await parseError(response);
    }
    try {
      await getRefreshPromise();
    } catch {
      redirectTo(LOGIN_ROUTE);
      throw await parseError(response);
    }
    return sendRequest(path, options, true);
  }

  if (response.status === 403) {
    const error = await parseError(response);
    if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
      redirectTo(CHANGE_PASSWORD_ROUTE);
    }
    throw error;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return response;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await sendRequest(path, options, false);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function fetchAuthSession(): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/me');
}
