'use client';

import { animate, motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

// Hold-to-confirm duration. One constant so the feel can be tuned in one place.
export const HOLD_MS = 2500;

interface HoldButtonProps {
  label: string;
  holdingLabel: string;
  /** True while the parent mutation is in flight. */
  busy: boolean;
  disabled?: boolean;
  onHold: () => void;
}

// Press-and-hold button with a fluid fill. The fill and the fire timer run off
// the same motion value, so they cannot desync or double-fire. Releasing
// early, sliding off, or a pointer cancel drains the fill and fires nothing.
export function HoldButton({ label, holdingLabel, busy, disabled, onHold }: HoldButtonProps) {
  const progress = useMotionValue(0);
  const run = useRef<ReturnType<typeof animate> | null>(null);
  const fired = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const off = disabled === true || busy;

  // The button unmounts on success (the card switches to checked-in state).
  // If we are still mounted, settled, and full, the mutation must have
  // failed — reset so the user can hold again.
  useEffect(() => {
    if (!busy && done) {
      const t = setTimeout(() => {
        fired.current = false;
        setDone(false);
        void animate(progress, 0, { duration: 0.2 });
      }, 600);
      return () => clearTimeout(t);
    }
  }, [busy, done, progress]);

  function stopRun() {
    run.current?.stop();
    run.current = null;
  }

  function fire() {
    if (fired.current) return;
    fired.current = true;
    stopRun();
    progress.set(1);
    setHolding(false);
    setDone(true);
    onHold();
  }

  function start(event: React.PointerEvent<HTMLButtonElement>) {
    if (off || fired.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setHolding(true);
    stopRun();
    run.current = animate(progress, 1, {
      duration: HOLD_MS / 1000,
      ease: 'linear',
      onComplete: fire,
    });
  }

  function cancel() {
    if (fired.current) return;
    stopRun();
    setHolding(false);
    void animate(progress, 0, { duration: 0.25, ease: 'easeOut' });
  }

  // Keyboard parity: holding Space/Enter fills, releasing cancels.
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
    if (off || fired.current) return;
    event.preventDefault();
    setHolding(true);
    stopRun();
    run.current = animate(progress, 1, {
      duration: HOLD_MS / 1000,
      ease: 'linear',
      onComplete: fire,
    });
  }

  return (
    <button
      ref={button}
      type="button"
      disabled={off}
      aria-live="polite"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={cancel}
      onContextMenu={(event) => event.preventDefault()}
      className="relative w-full touch-none overflow-hidden rounded-xl bg-evergreen px-4 py-3 font-medium text-white select-none disabled:opacity-60 sm:w-auto sm:min-w-56"
    >
      <motion.span
        aria-hidden
        style={{ scaleY: progress }}
        className="absolute inset-0 origin-bottom bg-mint/70"
      />
      <span className="relative">
        {busy || done ? 'Sending…' : holding ? holdingLabel : label}
      </span>
    </button>
  );
}
