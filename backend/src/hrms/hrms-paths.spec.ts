import { isHrmsPath } from './hrms-paths';

describe('isHrmsPath', () => {
  it('matches HRMS paths without capturing the legacy API', () => {
    expect(isHrmsPath('/api/health')).toBe(true);
    expect(isHrmsPath('/api')).toBe(true);
    expect(isHrmsPath('/api/v1')).toBe(false);
    expect(isHrmsPath('/api/v1/health')).toBe(false);
    expect(isHrmsPath('/api2/health')).toBe(false);
    expect(isHrmsPath('/api/v1/auth/login')).toBe(false);
    expect(isHrmsPath(undefined)).toBe(false);
  });
});
