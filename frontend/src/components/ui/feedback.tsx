import { AlertCircle, CheckCircle2, Info, Inbox, RefreshCw, TriangleAlert, X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-card border border-dashed border-border bg-surface p-8 text-center"><div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-surface-sunken text-fg-muted">{icon ?? <Inbox aria-hidden className="size-5" />}</div><h3 className="text-base font-semibold text-fg">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-card border border-danger/30 bg-danger-soft p-5"><div className="flex gap-3"><AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-fg" /><div><h3 className="font-semibold text-danger-fg">{title}</h3><p className="mt-1 text-sm text-danger-fg">{message}</p>{onRetry && <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}><RefreshCw aria-hidden className="size-4" />Retry</Button>}</div></div></div>;
}
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div aria-hidden className={cn('animate-pulse rounded-control bg-surface-sunken motion-reduce:animate-none', className)} {...props} />; }

type BannerTone = 'info' | 'warning' | 'danger' | 'success';
const bannerStyles = { info: 'border-info/30 bg-info-soft text-info-fg', warning: 'border-warning/30 bg-warning-soft text-warning-fg', danger: 'border-danger/30 bg-danger-soft text-danger-fg', success: 'border-success/30 bg-success-soft text-success-fg' };
const bannerIcons = { info: Info, warning: TriangleAlert, danger: AlertCircle, success: CheckCircle2 };
export function Banner({ tone = 'info', title, children, onDismiss }: { tone?: BannerTone; title: string; children?: ReactNode; onDismiss?: () => void }) {
  const Icon = bannerIcons[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-card border p-4', bannerStyles[tone])}><Icon aria-hidden className="mt-0.5 size-5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">{title}</p>{children && <div className="mt-1 text-sm">{children}</div>}</div>{onDismiss && <button type="button" aria-label="Dismiss" onClick={onDismiss} className="rounded-control p-1 hover:bg-black/5"><X aria-hidden className="size-4" /></button>}</div>;
}
