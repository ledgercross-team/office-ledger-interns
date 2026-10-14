'use client';

import { AlertDialog, Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, type ButtonProps } from './button';
import { Textarea } from './form-fields';

const overlay = 'fixed inset-0 z-50 bg-black/45 motion-fade';
const dialogPanel = 'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-surface-raised p-5 text-fg shadow-float motion-scale-in';

export interface DialogProps { trigger?: ReactNode; title: string; description?: string; children: ReactNode; footer?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }
export function Dialog({ trigger, title, description, children, footer, open, onOpenChange }: DialogProps) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}<DialogPrimitive.Portal><DialogPrimitive.Overlay className={overlay} /><DialogPrimitive.Content className={dialogPanel}><div className="pr-8"><DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>}</div><div className="mt-5">{children}</div>{footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}<DialogPrimitive.Close asChild><Button variant="ghost" size="sm" iconOnly aria-label="Close dialog" className="absolute right-3 top-3"><X aria-hidden className="size-4" /></Button></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}

export function ConfirmDialog({ trigger, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', loading, onConfirm }: { trigger: ReactNode; title: string; description: string; confirmLabel?: string; cancelLabel?: string; variant?: ButtonProps['variant']; loading?: boolean; onConfirm: () => void | Promise<void> }) {
  return <AlertDialog.Root><AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className={overlay} /><AlertDialog.Content className={dialogPanel}><AlertDialog.Title className="text-lg font-semibold text-fg">{title}</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm text-fg-muted">{description}</AlertDialog.Description><div className="mt-5 flex justify-end gap-2"><AlertDialog.Cancel asChild><Button variant="secondary">{cancelLabel}</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant={variant} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
}

export function ReasonDialog({ trigger, title, description, label = 'Reason', submitLabel = 'Continue', loading, onSubmit }: { trigger: ReactNode; title: string; description?: string; label?: string; submitLabel?: string; loading?: boolean; onSubmit: (reason: string) => void | Promise<void> }) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  return <DialogPrimitive.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setReason(''); }}><DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger><DialogPrimitive.Portal><DialogPrimitive.Overlay className={overlay} /><DialogPrimitive.Content className={dialogPanel}><DialogPrimitive.Title className="text-lg font-semibold text-fg">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>}<div className="mt-5"><Textarea label={label} value={reason} onChange={(event) => setReason(event.target.value)} required rows={4} /></div><div className="mt-5 flex justify-end gap-2"><DialogPrimitive.Close asChild><Button variant="secondary">Cancel</Button></DialogPrimitive.Close><Button loading={loading} disabled={reason.trim().length === 0} onClick={async () => { await onSubmit(reason.trim()); setOpen(false); }}>{submitLabel}</Button></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}

export function Drawer({ trigger, title, description, children, footer, side = 'right', open, onOpenChange }: DialogProps & { side?: 'right' | 'left' }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}<DialogPrimitive.Portal><DialogPrimitive.Overlay className={overlay} /><DialogPrimitive.Content className={cn('fixed inset-0 z-50 overflow-y-auto border-border bg-surface-raised p-5 text-fg shadow-float motion-fade sm:inset-y-0 sm:w-full sm:max-w-md sm:motion-slide-in-right', side === 'right' ? 'sm:left-auto sm:right-0 sm:border-l' : 'sm:left-0 sm:right-auto sm:border-r')}><div className="pr-8"><DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>}</div><div className="mt-5">{children}</div>{footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}<DialogPrimitive.Close asChild><Button variant="ghost" size="sm" iconOnly aria-label="Close drawer" className="absolute right-3 top-3"><X aria-hidden className="size-4" /></Button></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
