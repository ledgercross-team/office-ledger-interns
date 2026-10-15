'use client';

import { Check, LoaderCircle } from 'lucide-react';
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
  busy = false,
  disabled = false,
  disabledReason,
  onHold,
  size = 'md',
  className,
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** May return a promise: "Done" shows only if it resolves, and the water drains if it rejects. */
  onHold: () => void | Promise<unknown>;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const [filled, setFilled] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [hover, setHover] = useState(false);
  const [pct, setPct] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHoldRef = useRef(onHold);
  useEffect(() => {
    onHoldRef.current = onHold;
  }, [onHold]);
  const off = disabled || busy || waiting;

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
    timer.current = null;
    tick.current = null;
    setHolding(false);
    setPct(0);
  }

  function begin() {
    if (off || timer.current) return;
    setHolding(true);
    navigator.vibrate?.(8);
    const startedAt = Date.now();
    tick.current = setInterval(
      () => setPct(Math.min(99, Math.round(((Date.now() - startedAt) / HOLD_MS) * 100))),
      80,
    );
    timer.current = setTimeout(() => {
      if (tick.current) clearInterval(tick.current);
      timer.current = null;
      tick.current = null;
      setHolding(false);
      setPct(0);
      setWaiting(true);
      let result: void | Promise<unknown>;
      try {
        result = onHoldRef.current();
      } catch (err) {
        result = Promise.reject(err);
      }
      Promise.resolve(result)
        .then(
          () => {
            setFilled(true);
            navigator.vibrate?.([20, 40, 30]);
            setTimeout(() => setFilled(false), 900);
          },
          () => navigator.vibrate?.(60),
        )
        .finally(() => setWaiting(false));
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
      onPointerEnter={() => setHover(true)}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={() => {
        setHover(false);
        cancel();
      }}
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
        'relative inline-flex shrink-0 touch-none select-none items-center justify-center overflow-hidden rounded-full border border-primary bg-primary-soft font-medium text-fg transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] enabled:hover:-translate-y-px motion-reduce:transform-none',
        holding && 'scale-[0.94]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'min-h-8 px-3 py-1 text-xs' : 'min-h-10 px-4 py-2 text-sm',
        className,
      )}
    >
      {/* The water: the whole body rises over HOLD_MS with two out-of-phase waves on its surface; it drains at once when released early. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <span
          className="absolute inset-x-0 bottom-0 h-full will-change-transform"
          style={{
            transform:
              holding || filled || waiting
                ? 'translateY(0)'
                : hover && !off
                  ? 'translateY(calc(88% + 4px))'
                  : 'translateY(calc(100% + 14px))',
            transition: holding
              ? `transform ${HOLD_MS}ms cubic-bezier(0.35, 0.05, 0.45, 1)`
              : 'transform 450ms cubic-bezier(0.3, 0.7, 0.3, 1)',
          }}
        >
          <span className="absolute inset-0 bg-primary/40" />
          {holding &&
            [12, 38, 64, 84].map((left, i) => (
              <span
                key={left}
                className="hold-bubble absolute bottom-1 size-1.5 rounded-full bg-white/70 motion-reduce:hidden"
                style={{ left: `${left}%`, animationDelay: `${i * 350}ms` }}
              />
            ))}
          {[
            { opacity: 0.35, duration: '2.6s', reverse: true },
            { opacity: 0.5, duration: '1.7s', reverse: false },
          ].map((wave) => (
            <svg
              key={wave.duration}
              className="hold-wave absolute bottom-full left-0 h-3 w-[200%] text-primary"
              style={{
                opacity: wave.opacity,
                animationDuration: wave.duration,
                animationDirection: wave.reverse ? 'reverse' : 'normal',
              }}
              viewBox="0 0 200 12"
              preserveAspectRatio="none"
            >
              <path
                d="M0 6 C25 0 25 0 50 6 S75 12 100 6 S125 0 150 6 S175 12 200 6 V12 H0 Z"
                fill="currentColor"
              />
            </svg>
          ))}
        </span>
      </span>
      {filled && (
        <span
          aria-hidden
          className="hold-flash pointer-events-none absolute inset-0 rounded-[inherit] bg-white/70"
        />
      )}
      <span
        className={cn(
          'relative inline-flex items-center gap-2 transition-opacity duration-150',
          (holding || filled || waiting) && 'opacity-0',
        )}
      >
        {busy ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : null}
        {children}
      </span>
      {(holding || filled || waiting) && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center gap-1.5 font-bold tabular-nums"
        >
          {filled ? (
            <>
              <Check className="hold-pop size-4" strokeWidth={3} />
              Done
            </>
          ) : waiting ? (
            <>
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
              Working…
            </>
          ) : (
            <>Keep holding · {pct}%</>
          )}
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {holding ? 'Holding. Keep pressing for 2.5 seconds.' : ''}
      </span>
    </button>
  );
}
