'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** How long the button must be held. One constant so the feel is tuned in one place. */
export const HOLD_MS = 2500;

/**
 * Press-and-hold button for actions that must not fire by accident
 * (check in, check out). Works with mouse, touch and keyboard (hold Space or
 * Enter). Releasing early, leaving the button or blurring cancels it.
 */
export function HoldButton({
  children,
  holdingLabel = 'Keep holding…',
  busy = false,
  disabled = false,
  disabledReason,
  onHold,
  size = 'md',
  className,
}: {
  children: ReactNode;
  holdingLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onHold: () => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHoldRef = useRef(onHold);
  useEffect(() => {
    onHoldRef.current = onHold;
  }, [onHold]);
  const off = disabled || busy;

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  function begin() {
    if (off || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onHoldRef.current();
    }, HOLD_MS);
  }

  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      disabled={off}
      title={disabled ? disabledReason : undefined}
      aria-busy={busy || undefined}
      aria-describedby={undefined}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        begin();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          begin();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') cancel();
      }}
      onBlur={cancel}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'relative inline-flex shrink-0 touch-none select-none items-center justify-center overflow-hidden rounded-control border border-primary bg-primary font-medium text-primary-fg',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'min-h-8 px-3 py-1 text-xs' : 'min-h-10 px-4 py-2 text-sm',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-primary-fg/30"
        style={{
          width: holding ? '100%' : '0%',
          transition: holding ? `width ${HOLD_MS}ms linear` : 'width 150ms ease-out',
        }}
      />
      <span className="relative inline-flex items-center gap-2">
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
        {holding ? holdingLabel : children}
      </span>
      <span className="sr-only" aria-live="polite">
        {holding ? 'Holding. Keep pressing for 2.5 seconds.' : ''}
      </span>
    </button>
  );
}
