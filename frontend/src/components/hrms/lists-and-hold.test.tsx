import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/lib/hrms/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hrms/api-client')>();
  return { ...original, hrmsFetch: vi.fn() };
});

import { hrmsFetch } from '@/lib/hrms/api-client';
import { HOLD_MS, HoldButton } from '@/components/hrms/hold-button';
import { MemberSearch } from '@/components/hrms/member-search';
import { Pagination, pageWindow } from '@/components/ui';

const mockedFetch = vi.mocked(hrmsFetch);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });
  it('collapses long ranges around the current page', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, null, 20]);
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 18, 19, 20]);
  });
});

describe('Pagination', () => {
  it('numbers the pages and moves with a number or View more', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={25} total={120} onPage={onPage} />);
    expect(screen.getByText('1', { selector: '[aria-current="page"]' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: /View more/ }));
    expect(onPage).toHaveBeenLastCalledWith(2);
  });
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageSize={25} total={10} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('HoldButton', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires only after the full hold', () => {
    const onHold = vi.fn();
    render(<HoldButton onHold={onHold}>Hold to check in</HoldButton>);
    const button = screen.getByRole('button');
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    });
    act(() => vi.advanceTimersByTime(HOLD_MS - 100));
    expect(onHold).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(onHold).toHaveBeenCalledOnce();
  });

  it('cancels when released early', () => {
    const onHold = vi.fn();
    render(<HoldButton onHold={onHold}>Hold to check in</HoldButton>);
    const button = screen.getByRole('button');
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    });
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not start while disabled or busy', () => {
    const onHold = vi.fn();
    render(<HoldButton onHold={onHold} busy>Hold to check in</HoldButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('MemberSearch', () => {
  it('searches the API with the typed text instead of listing everyone', async () => {
    mockedFetch.mockResolvedValue({ items: [{ id: 'm1', fullName: 'Sara Ahmed', role: 'employee', email: 's@x.io' }], total: 1, page: 1, pageSize: 8 });
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MemberSearch label="Person" onSelect={onSelect} />, { wrapper });
    await user.type(screen.getByRole('combobox', { name: 'Person' }), 'sara');
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith(expect.stringContaining('q=sara')));
    expect(String(mockedFetch.mock.calls.at(-1)?.[0])).toContain('pageSize=8');
    await user.click(await screen.findByRole('option', { name: /Sara Ahmed/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('filters a local list and supports the keyboard', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MemberSearch
        label="Add someone"
        localOptions={[
          { id: 'a', fullName: 'Ibrahim Khan' },
          { id: 'b', fullName: 'Tariq Aziz' },
        ]}
        onSelect={onSelect}
      />,
      { wrapper },
    );
    await user.type(screen.getByRole('combobox'), 'tar');
    expect(screen.queryByRole('option', { name: /Ibrahim/ })).toBeNull();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
