import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/lib/hrms/auth-context', () => ({ useHrmsAuth: vi.fn() }));
vi.mock('@/lib/hrms/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hrms/api-client')>();
  return { ...original, hrmsFetch: vi.fn() };
});

import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { MessagesApp } from '@/components/hrms/messages-app';

const mockedFetch = vi.mocked(hrmsFetch);

function as(role: string | null) {
  vi.mocked(useHrmsAuth).mockReturnValue({
    session: { role, org: { status: 'active' }, isGameMaster: role === 'gameMaster' },
  } as unknown as ReturnType<typeof useHrmsAuth>);
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetch.mockImplementation(async (path: string) => {
    if (path.includes('/threads')) return { items: [] };
    if (path.startsWith('/reports/ceos'))
      return { items: [{ userId: 'c1', fullName: 'Aisha Chowdhury' }] };
    if (path.startsWith('/reports')) return { items: [] };
    if (path.includes('/recipients'))
      return { items: [{ userId: 'u9', fullName: 'Casey Okafor', role: 'coo' }] };
    return {};
  });
});

describe('MessagesApp', () => {
  it('gives a CEO a Reports tab and an employee My reports', () => {
    as('ceo');
    const { unmount } = render(<MessagesApp mode="org" />, { wrapper });
    expect(screen.getByRole('tab', { name: 'Reports' })).toBeInTheDocument();
    unmount();
    as('employee');
    render(<MessagesApp mode="org" />, { wrapper });
    expect(screen.getByRole('tab', { name: 'My reports' })).toBeInTheDocument();
  });

  it('has no reports tab in the platform console', () => {
    as('gameMaster');
    render(<MessagesApp mode="platform" />, { wrapper });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(mockedFetch).toHaveBeenCalledWith('/platform/messages/threads');
  });

  it('searches only the people the server says you may write to', async () => {
    as('employee');
    const user = userEvent.setup();
    render(<MessagesApp mode="org" />, { wrapper });
    await user.click(await screen.findByRole('button', { name: /New message/ }));
    await user.type(screen.getByRole('combobox'), 'cas');
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('/messages/recipients?q=cas'));
    expect(await screen.findByRole('option', { name: /Casey Okafor/ })).toBeInTheDocument();
  });

  it('a new report is anonymous by default and says what that means', async () => {
    as('manager');
    const user = userEvent.setup();
    render(<MessagesApp mode="org" />, { wrapper });
    await user.click(screen.getByRole('tab', { name: 'My reports' }));
    await user.click(await screen.findByRole('button', { name: /New report/ }));
    expect(screen.getByRole('switch', { name: 'Send anonymously' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/Your name is hidden from the CEO/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Send anonymously' }));
    expect(screen.getByText(/The CEO will see your name/)).toBeInTheDocument();
  });

  it('sends a report with the choice made', async () => {
    as('employee');
    const user = userEvent.setup();
    render(<MessagesApp mode="org" />, { wrapper });
    await user.click(screen.getByRole('tab', { name: 'My reports' }));
    await user.click(await screen.findByRole('button', { name: /New report/ }));
    await user.type(await screen.findByLabelText('Subject'), 'Concern');
    await user.type(screen.getByLabelText(/What happened/), 'private matter');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith('/reports', {
        method: 'POST',
        body: { ceoUserId: 'c1', subject: 'Concern', body: 'private matter', anonymous: true },
      }),
    );
  });
});
