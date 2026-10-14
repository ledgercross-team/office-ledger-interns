import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/lib/hrms/auth-context', () => ({
  HRMS_SESSION_KEY: ['hrms', 'session'],
  useHrmsAuth: vi.fn(),
}));
vi.mock('@/lib/hrms/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hrms/api-client')>();
  return { ...original, hrmsFetch: vi.fn() };
});

import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { SecurityCard } from '@/components/hrms/security-card';

const mockedFetch = vi.mocked(hrmsFetch);

function withAuth(mfaEnabled: boolean) {
  vi.mocked(useHrmsAuth).mockReturnValue({
    session: { user: { id: 'u', email: 'a@x.io', fullName: 'A', timezone: 'UTC', mfaEnabled } },
  } as unknown as ReturnType<typeof useHrmsAuth>);
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('SecurityCard', () => {
  it('is off by default and offers to turn it on', () => {
    withAuth(false);
    render(<SecurityCard />, { wrapper });
    expect(screen.getByText('off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on authenticator' })).toBeInTheDocument();
  });

  it('turns on with password, then a code, and shows the backup codes once', async () => {
    withAuth(false);
    mockedFetch
      .mockResolvedValueOnce({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
      })
      .mockResolvedValueOnce({ backupCodes: ['AAAA-BBBB', 'CCCC-DDDD'] });
    const user = userEvent.setup();
    render(<SecurityCard />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Turn on authenticator' }));
    await user.type(screen.getByLabelText(/Your password/), 'my password 1234');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockedFetch).toHaveBeenCalledWith('/auth/mfa/setup', {
      method: 'POST',
      body: { password: 'my password 1234' },
    });
    await user.type(await screen.findByLabelText(/6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(mockedFetch).toHaveBeenLastCalledWith('/auth/mfa/enable', {
      method: 'POST',
      body: { code: '123456' },
    });
    expect(await screen.findByText('AAAA-BBBB')).toBeInTheDocument();
  });

  it('shows the server message when the code is wrong', async () => {
    withAuth(true);
    const { HrmsApiError } = await import('@/lib/hrms/api-client');
    mockedFetch.mockRejectedValueOnce(new HrmsApiError(401, 'The code is not correct.'));
    const user = userEvent.setup();
    render(<SecurityCard />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Turn off authenticator' }));
    await user.type(screen.getByLabelText(/Current code/), '000000');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('The code is not correct.')).toBeInTheDocument();
  });

  it('makes five new backup codes for a signed-in user and offers a .txt download', async () => {
    withAuth(true);
    mockedFetch.mockResolvedValueOnce({
      backupCodes: ['AAAA-AAAA', 'BBBB-BBBB', 'CCCC-CCCC', 'DDDD-DDDD', 'EEEE-EEEE'],
    });
    const user = userEvent.setup();
    render(<SecurityCard />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'New backup codes' }));
    await user.type(screen.getByLabelText(/Current 6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Create 5 new codes' }));
    expect(mockedFetch).toHaveBeenCalledWith('/auth/mfa/backup-codes', {
      method: 'POST',
      body: { code: '123456' },
    });
    expect(await screen.findByText('EEEE-EEEE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download .txt' })).toBeInTheDocument();
  });
});
