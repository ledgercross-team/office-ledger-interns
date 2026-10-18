import type { HTMLAttributes, ReactNode } from 'react';
import type { StatusDefinition, SemanticTone } from '@/lib/hrms/status-vocabulary';
import { cn } from '@/lib/cn';

const tones: Record<SemanticTone, string> = {
  neutral: 'border-border bg-surface-sunken text-fg-muted',
  primary: 'border-primary/30 bg-primary-soft text-primary',
  success: 'border-success/30 bg-success-soft text-success-fg',
  warning: 'border-warning/30 bg-warning-soft text-warning-fg',
  danger: 'border-danger/30 bg-danger-soft text-danger-fg',
  info: 'border-info/30 bg-info-soft text-info-fg',
};

export function Badge({
  children,
  tone = 'neutral',
  icon,
  className,
  ...props
}: {
  children: ReactNode;
  tone?: SemanticTone;
  icon?: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-4',
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusPill({
  status,
  className,
}: {
  status: StatusDefinition;
  className?: string;
}) {
  const Icon = status.icon;
  return (
    <Badge
      tone={status.tone}
      icon={<Icon aria-hidden className="size-3.5" />}
      className={cn(status.strike && 'line-through', className)}
    >
      {status.label}
    </Badge>
  );
}
