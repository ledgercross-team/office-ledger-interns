'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const HOLD_DELAY_MS = 380;
const HOLD_EVERY_MS = 110;

/** One half of the stacked arrows: steps on press, and keeps stepping while it is held. */
function StepButton({
  label,
  disabled,
  onStep,
  children,
}: {
  label: string;
  disabled: boolean;
  onStep: () => void;
  children: ReactNode;
}) {
  const stepRef = useRef(onStep);
  const timers = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    every?: ReturnType<typeof setInterval>;
  }>({});

  useEffect(() => {
    stepRef.current = onStep;
  });

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.every);
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // The field itself takes the keyboard; these are for the pointer.
      tabIndex={-1}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        stepRef.current();
        timers.current.delay = setTimeout(() => {
          timers.current.every = setInterval(() => stepRef.current(), HOLD_EVERY_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="flex flex-1 items-center justify-center text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg active:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
    >
      {children}
    </button>
  );
}

/**
 * A value with stacked up/down buttons: up adds one, down takes one away. Arrow keys do the
 * same from the keyboard; Page Up and Page Down call `onPageUp` / `onPageDown`. Give `onCommit`
 * to let the value be typed too.
 */
export function StepperField({
  label,
  text,
  valueNow,
  canUp,
  canDown,
  onUp,
  onDown,
  onPageUp,
  onPageDown,
  onCommit,
  className,
}: {
  label: string;
  text: string;
  valueNow?: number;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onPageUp?: () => void;
  onPageDown?: () => void;
  /** Makes the value typeable; called with the typed text when it is committed. */
  onCommit?: (typed: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const actions: Record<string, (() => void) | undefined> = {
      ArrowUp: canUp ? onUp : undefined,
      ArrowDown: canDown ? onDown : undefined,
      PageUp: onPageUp,
      PageDown: onPageDown,
    };
    if (event.key in actions) {
      event.preventDefault();
      actions[event.key]?.();
    }
  }

  const shared = {
    role: 'spinbutton' as const,
    'aria-label': label,
    'aria-valuetext': text,
    'aria-valuenow': valueNow,
    onKeyDown,
    // Inline: the global `font: inherit` and :focus-visible rules are unlayered and outrank
    // utility classes. The container shows focus with focus-within.
    style: { font: 'inherit', fontSize: '0.875rem', fontWeight: 500, outline: 'none' },
    className: 'flex min-w-0 flex-1 items-center bg-transparent px-3 tabular-nums text-fg',
  };

  return (
    <div
      className={cn(
        'inline-flex h-10 items-stretch overflow-hidden rounded-control border border-border bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10',
        className,
      )}
    >
      {onCommit ? (
        <input
          {...shared}
          type="text"
          inputMode="numeric"
          value={draft ?? text}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null) onCommit(draft);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (draft !== null) onCommit(draft);
              setDraft(null);
              return;
            }
            if (event.key === 'Escape') {
              setDraft(null);
              return;
            }
            onKeyDown(event);
          }}
        />
      ) : (
        <div {...shared} tabIndex={0}>
          {text}
        </div>
      )}
      <div className="flex w-8 flex-col divide-y divide-border border-l border-border">
        <StepButton label={`Next ${label.toLowerCase()}`} disabled={!canUp} onStep={onUp}>
          <ChevronUp aria-hidden className="size-3.5" strokeWidth={2.25} />
        </StepButton>
        <StepButton label={`Previous ${label.toLowerCase()}`} disabled={!canDown} onStep={onDown}>
          <ChevronDown aria-hidden className="size-3.5" strokeWidth={2.25} />
        </StepButton>
      </div>
    </div>
  );
}
