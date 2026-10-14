import { mapDatabaseError } from './hrms-error.filter';

const pg = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  message: 'raw message',
  ...extra,
});
// drizzle wraps the driver error: Error -> cause = pg error
const wrapped = (inner: unknown) => Object.assign(new Error('Failed query: select ...'), { cause: inner });

describe('mapDatabaseError', () => {
  it('shows a rule message (P0001) as is, with 409', () => {
    expect(mapDatabaseError(wrapped(pg('P0001', { message: 'Seat limit reached' })))).toEqual({
      status: 409,
      message: 'Seat limit reached',
      code: 'RULE',
    });
  });

  it('shows a trigger-raised check_violation (no constraint name) as a rule, 409', () => {
    expect(
      mapDatabaseError(pg('23514', { message: 'Seat limit reached (11 of 10). The request was refused.' })),
    ).toEqual({
      status: 409,
      message: 'Seat limit reached (11 of 10). The request was refused.',
      code: 'RULE',
    });
  });

  it('maps a named CHECK constraint to 422 with the generic message', () => {
    expect(mapDatabaseError(pg('23514', { constraint: 'org_settings_check' }))).toEqual({
      status: 422,
      message: 'A value is not allowed.',
      code: 'org_settings_check',
    });
  });

  it.each([
    ['23505', 409],
    ['23503', 409],
    ['42501', 403],
    ['XX000', 500],
  ])('maps %s to %i', (code, status) => {
    expect(mapDatabaseError(pg(code))?.status).toBe(status);
  });

  it('does not leak the raw message for non-rule errors', () => {
    expect(mapDatabaseError(pg('23505', { message: 'duplicate key value ... secret' }))?.message)
      .not.toContain('secret');
  });

  it('returns null for errors that are not database errors', () => {
    expect(mapDatabaseError(new Error('nope'))).toBeNull();
  });
});
