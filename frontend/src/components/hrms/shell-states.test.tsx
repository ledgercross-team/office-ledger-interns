import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FullPageState } from '@/components/hrms/full-page-state';
import { Button, ReadOnlyProvider } from '@/components/ui';

describe('read-only mode', () => {
  it('disables a mutating button but leaves other buttons usable', () => {
    render(
      <ReadOnlyProvider value="This organisation is read-only.">
        <Button mutates>Save</Button>
        <Button>Open filters</Button>
      </ReadOnlyProvider>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open filters' })).toBeEnabled();
  });

  it('keeps a mutating button enabled when the org is not read-only', async () => {
    const onClick = vi.fn();
    render(
      <ReadOnlyProvider value={null}>
        <Button mutates onClick={onClick}>Save</Button>
      </ReadOnlyProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('full-page states', () => {
  it.each([
    ['blocked', 'This organisation is blocked'],
    ['suspended', 'This organisation is suspended'],
    ['forbidden', "You don't have permission to do that."],
    ['not-found', "We couldn't find that page."],
    ['error', 'Something went wrong.'],
  ] as const)('%s has one heading and a way back', (kind, title) => {
    render(<FullPageState kind={kind} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });

  it('offers Try again only when a retry handler is given', async () => {
    const retry = vi.fn();
    render(<FullPageState kind="error" onRetry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders no second landmark when embedded in the shell', () => {
    render(<FullPageState kind="forbidden" embedded />);
    expect(screen.queryByRole('main')).toBeNull();
  });
});
