import { NextResponse, type NextRequest } from 'next/server';

const LOGIN = '/login';
const PUBLIC_PATHS = [LOGIN, '/accept-invite', '/forgot-password'];
const PAGE_ROOTS = [
  '/',
  '/login',
  '/accept-invite',
  '/forgot-password',
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

function isPage(pathname: string): boolean {
  return PAGE_ROOTS.some((root) =>
    root === '/' ? pathname === '/' : pathname === root || pathname.startsWith(root + '/'),
  );
}

// Cookie presence only. Real authorization is the API's job.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV !== 'production' && pathname === '/design-system') {
    return NextResponse.next();
  }

  const hasTokens =
    Boolean(request.cookies.get('hrms_access')?.value) ||
    Boolean(request.cookies.get('hrms_refresh')?.value);

  if (isPage(pathname)) {
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!hasTokens && !isPublic) {
      const url = new URL(LOGIN, request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (hasTokens && pathname === LOGIN) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
};
