'use client';

import { Toast as ToastPrimitive } from 'radix-ui';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastInput { title: string; description?: string; tone?: ToastTone; action?: { label: string; onClick: () => void } }
interface ToastItem extends ToastInput { id: number }
const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);
const toneClass = { success: 'border-success/40 text-success-fg', error: 'border-danger/40 text-danger-fg', info: 'border-info/40 text-info-fg' };
const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((input: ToastInput) => setItems((current) => [...current, { ...input, id: Date.now() + current.length }]), []);
  const value = useMemo(() => push, [push]);
  return <ToastContext.Provider value={value}><ToastPrimitive.Provider swipeDirection="right">{children}{items.map((item) => { const tone = item.tone ?? 'info'; const Icon = icons[tone]; return <ToastPrimitive.Root key={item.id} duration={5000} onOpenChange={(open) => { if (!open) setItems((current) => current.filter((entry) => entry.id !== item.id)); }} type={tone === 'error' ? 'foreground' : 'background'} className={cn('grid grid-cols-[auto_1fr_auto] gap-3 rounded-card border bg-surface-raised p-4 shadow-float motion-slide-in-right', toneClass[tone])}><Icon aria-hidden className="mt-0.5 size-5" /><div><ToastPrimitive.Title className="font-semibold">{item.title}</ToastPrimitive.Title>{item.description && <ToastPrimitive.Description className="mt-1 text-sm text-fg-muted">{item.description}</ToastPrimitive.Description>}{item.action && <ToastPrimitive.Action altText={item.action.label} onClick={item.action.onClick} className="mt-2 text-sm font-medium underline">{item.action.label}</ToastPrimitive.Action>}</div><ToastPrimitive.Close aria-label="Dismiss notification" className="rounded-control p-1"><X aria-hidden className="size-4" /></ToastPrimitive.Close></ToastPrimitive.Root>; })}<ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none" /></ToastPrimitive.Provider></ToastContext.Provider>;
}
export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error('useToast must be used inside ToastProvider'); return context; }
