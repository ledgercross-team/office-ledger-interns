// HRMS lives beside the legacy API under /api. The legacy /api/v1 routes must not be
// mistaken for HRMS requests, so the three legacy guards continue to judge them normally.
export const HRMS_API_PREFIX = '/api';

export function isHrmsPath(path: string | undefined): boolean {
  return (
    path !== undefined &&
    (path === HRMS_API_PREFIX ||
      (path.startsWith(`${HRMS_API_PREFIX}/`) &&
        path !== '/api/v1' &&
        !path.startsWith('/api/v1/')))
  );
}
