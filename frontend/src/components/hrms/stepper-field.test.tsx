import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepperField } from '@/components/hrms/stepper-field';

function setup(props: Partial<Parameters<typeof StepperField>[0]> = {}) {
  const onUp = vi.fn();
  const onDown = vi.fn();
  render(
    <StepperField label="Year" text="2026" canUp canDown onUp={onUp} onDown={onDown} {...props} />,
  );
  return { onUp, onDown };
}

afterEach(() => vi.useRealTimers());

describe('StepperField', () => {
  it('steps up and down from the buttons', () => {
    const { onUp, onDown } = setup();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Next year' }), { button: 0 });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Next year' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Previous year' }), { button: 0 });
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('keeps stepping while held and stops on release', () => {
    vi.useFakeTimers();
    const { onUp } = setup();
    const button = screen.getByRole('button', { name: 'Next year' });
    fireEvent.pointerDown(button, { button: 0 });
    act(() => void vi.advanceTimersByTime(380 + 110 * 3));
    expect(onUp.mock.calls.length).toBeGreaterThanOrEqual(4);
    fireEvent.pointerUp(button);
    const after = onUp.mock.calls.length;
    act(() => void vi.advanceTimersByTime(1000));
    expect(onUp).toHaveBeenCalledTimes(after);
  });

  it('does not step past a limit', () => {
    const { onUp } = setup({ canUp: false });
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Year' }), { key: 'ArrowUp' });
    expect(onUp).not.toHaveBeenCalled();
  });

  it('uses the arrow and page keys', async () => {
    const onPageUp = vi.fn();
    const { onUp, onDown } = setup({ onPageUp });
    const field = screen.getByRole('spinbutton', { name: 'Year' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'PageUp' });
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onPageUp).toHaveBeenCalledTimes(1);
  });

  it('commits a typed value on Enter', async () => {
    const onCommit = vi.fn();
    setup({ onCommit });
    const field = screen.getByRole('spinbutton', { name: 'Year' });
    await userEvent.clear(field);
    await userEvent.type(field, '2014{Enter}');
    expect(onCommit).toHaveBeenCalledWith('2014');
  });
});
