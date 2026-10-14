// Fetch wrapper for the API. Single-flight refresh on 401, with the hrms_* cookies (set by
// the API, sent with credentials: 'include').

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh';
export const HRMS_LOGIN_ROUTE = '/login';

export class HrmsApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    message: string,
    code?: string,
    fieldErrors?: Record<string, string[]>,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'HrmsApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
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
  errors?: Record<string, string | string[]>;
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function parseError(response: Response): Promise<HrmsApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }
  const raw = body?.message ?? body?.error;
  const serverMessage = Array.isArray(raw) ? raw.join(', ') : raw;
  const wait = retryAfter(response);
  const message = response.status === 403
    ? "You don't have permission to do that."
    : response.status === 429
      ? `Too many attempts. Try again${wait === undefined ? ' shortly' : ` in ${wait} seconds`}.`
      : response.status >= 500
        ? 'Something went wrong. Please try again.'
        : serverMessage || response.statusText || `Request failed with status ${response.status}`;
  const fieldErrors = body?.errors
    ? Object.fromEntries(Object.entries(body.errors).map(([field, errors]) => [field, Array.isArray(errors) ? errors : [errors]]))
    : undefined;
  return new HrmsApiError(
    response.status,
    message,
    body?.code,
    fieldErrors,
    wait,
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
