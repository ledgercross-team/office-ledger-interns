'use client';

import { DropdownMenu as DropdownPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const floating = 'z-50 rounded-card border border-border bg-surface-raised p-1 text-fg shadow-float motion-scale-in';
export interface MenuItem { label: string; icon?: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean; checked?: boolean; children?: MenuItem[] }
function Items({ items }: { items: MenuItem[] }) {
  return <>{items.map((item) => item.children ? <DropdownPrimitive.Sub key={item.label}><DropdownPrimitive.SubTrigger disabled={item.disabled} className="flex min-h-9 items-center gap-2 rounded-control px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50">{item.icon}{item.label}<ChevronRight aria-hidden className="ml-auto size-4" /></DropdownPrimitive.SubTrigger><DropdownPrimitive.Portal><DropdownPrimitive.SubContent className={floating}><Items items={item.children} /></DropdownPrimitive.SubContent></DropdownPrimitive.Portal></DropdownPrimitive.Sub> : <DropdownPrimitive.CheckboxItem key={item.label} checked={item.checked} disabled={item.disabled} onSelect={item.onSelect} className={cn('relative flex min-h-9 items-center gap-2 rounded-control py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50', item.danger && 'text-danger-fg')}><DropdownPrimitive.ItemIndicator className="absolute left-2"><Check aria-hidden className="size-4" /></DropdownPrimitive.ItemIndicator>{item.icon}{item.label}</DropdownPrimitive.CheckboxItem>)}</>;
}
export function DropdownMenu({ trigger, items, label }: { trigger: ReactNode; items: MenuItem[]; label: string }) {
  return <DropdownPrimitive.Root><DropdownPrimitive.Trigger asChild aria-label={label}>{trigger}</DropdownPrimitive.Trigger><DropdownPrimitive.Portal><DropdownPrimitive.Content sideOffset={6} align="end" className={cn(floating, 'min-w-48')}><Items items={items} /></DropdownPrimitive.Content></DropdownPrimitive.Portal></DropdownPrimitive.Root>;
}
export function Popover({ trigger, title, children, align = 'center' }: { trigger: ReactNode; title?: string; children: ReactNode; align?: 'start' | 'center' | 'end' }) {
  return <PopoverPrimitive.Root><PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content sideOffset={6} align={align} className={cn(floating, 'w-72 p-4')}>{title && <p className="mb-2 font-semibold">{title}</p>}{children}<PopoverPrimitive.Arrow className="fill-border" /></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>;
}
export function Tooltip({ children, content, side = 'top' }: { children: ReactNode; content: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return <TooltipPrimitive.Provider delayDuration={250}><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-64 rounded-control bg-fg px-3 py-2 text-xs text-bg shadow-float motion-fade">{content}<TooltipPrimitive.Arrow className="fill-fg" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></TooltipPrimitive.Provider>;
}
