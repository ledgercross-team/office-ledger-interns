import { NextResponse, type NextRequest } from 'next/server';

const HRMS_LOGIN = '/login';
const HRMS_PUBLIC_PATHS = [HRMS_LOGIN, '/accept-invite'];
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
  return HRMS_ROUTE_ROOTS.some((root) =>
    root === '/' ? pathname === '/' : pathname === root || pathname.startsWith(root + '/'),
  );
}

// Cookie presence only. Real authorization is the API's job.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Keep old /hrms bookmarks working while the public URL is now at the root.
  if (pathname === '/hrms' || pathname.startsWith('/hrms/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice('/hrms'.length) || '/';
    return NextResponse.redirect(url);
  }

  const hasHrmsTokens =
    Boolean(request.cookies.get('hrms_access')?.value) ||
    Boolean(request.cookies.get('hrms_refresh')?.value);

  if (isHrmsPath(pathname)) {
    const isPublic = HRMS_PUBLIC_PATHS.includes(pathname);
    if (!hasHrmsTokens && !isPublic) {
      const url = new URL(HRMS_LOGIN, request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (hasHrmsTokens && pathname === HRMS_LOGIN) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Everything outside the HRMS route set is still a legacy page.
  const hasLegacyTokens =
    Boolean(request.cookies.get('access_token')?.value) ||
    Boolean(request.cookies.get('refresh_token')?.value);

  if (!hasLegacyTokens) {
    const url = new URL(HRMS_LOGIN, request.url);
    url.searchParams.set('next', '/');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
};
