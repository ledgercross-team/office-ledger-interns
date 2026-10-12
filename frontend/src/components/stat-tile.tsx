'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

// Counts up from zero the first time the tile scrolls into view.
function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      // Reduced motion jumps straight to the number.
      duration: reduce ? 0 : 0.9,
      ease: 'easeOut',
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return (
    <span ref={ref}>
      {shown}
      {suffix}
    </span>
  );
}

export function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning';
}) {
  const alert = tone === 'warning' && Number(value) > 0;
  // "12" and "80%" count up; anything else (dates, "—") is shown as is.
  const match = /^(\d+)(%?)$/.exec(String(value));

  return (
    <div className="rounded-xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
      <p className="text-sm text-charcoal-soft">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert ? 'text-alert-deep' : 'text-charcoal'}`}>
        {match ? <CountUp value={Number(match[1])} suffix={match[2]} /> : value}
      </p>
    </div>
  );
}
