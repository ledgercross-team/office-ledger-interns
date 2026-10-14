import { afterEach, describe, expect, it, vi } from 'vitest';
import { HrmsApiError, hrmsFetch } from './api-client';

afterEach(() => vi.unstubAllGlobals());

async function errorFor(response: Response): Promise<HrmsApiError> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  try {
    await hrmsFetch('/example', { skipAuthRefresh: true });
    throw new Error('Expected request to fail');
  } catch (error) {
    return error as HrmsApiError;
  }
}

describe('HRMS API error mapping', () => {
  it('preserves database rule messages for 409', async () => {
    const error = await errorFor(Response.json({ message: 'You cannot approve your own request' }, { status: 409 }));
    expect(error.message).toBe('You cannot approve your own request');
  });

  it('normalizes permissions, field errors, rate limits and server errors', async () => {
    expect((await errorFor(Response.json({ message: 'raw' }, { status: 403 }))).message).toBe("You don't have permission to do that.");
    const invalid = await errorFor(Response.json({ message: 'Invalid', errors: { email: ['Email is invalid'] } }, { status: 422 }));
    expect(invalid.fieldErrors).toEqual({ email: ['Email is invalid'] });
    const limited = await errorFor(Response.json({}, { status: 429, headers: { 'Retry-After': '30' } }));
    expect(limited.message).toBe('Too many attempts. Try again in 30 seconds.');
    expect(limited.retryAfterSeconds).toBe(30);
    expect((await errorFor(Response.json({ message: 'database details' }, { status: 500 }))).message).toBe('Something went wrong. Please try again.');
  });
});
