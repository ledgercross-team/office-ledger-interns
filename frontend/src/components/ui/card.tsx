'use client';

import Link from 'next/link';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-card border border-border bg-surface p-5 text-fg transition-[border-color,background-color,box-shadow] duration-150 ease-out',
        className,
      )}
      {...props}
    />
  );
}

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: reduce ? 0 : 0.75,
      ease: 'easeOut',
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);
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
  delta,
  href,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  delta?: string;
  href?: string;
  tone?: 'default' | 'warning' | 'danger';
  icon?: ReactNode;
}) {
  const match = /^(\d+)(%?)$/.exec(String(value));
  const body = (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg-muted">{label}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg',
              tone === 'warning' && 'text-warning-fg',
              tone === 'danger' && 'text-danger-fg',
            )}
          >
            {match ? <CountUp value={Number(match[1])} suffix={match[2]} /> : value}
          </p>
          {delta && <p className="mt-1 text-xs text-fg-muted">{delta}</p>}
        </div>
        {icon && <span className="rounded-full bg-primary-soft p-2 text-primary">{icon}</span>}
      </div>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-card transition-[box-shadow,background-color] duration-150 hover:ring-2 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function ProgressBar({
  value,
  label,
  max = 100,
  className,
}: {
  value: number;
  label: string;
  max?: number;
  className?: string;
}) {
  const percent = Math.min(100, Math.max(0, max ? (value / max) * 100 : 0));
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex justify-between gap-3 text-xs text-fg-muted">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
