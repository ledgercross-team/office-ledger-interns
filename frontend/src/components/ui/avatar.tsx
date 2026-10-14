import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export interface AvatarProps { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg'; roleRing?: boolean; className?: string }
const sizes = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' };
export function Avatar({ name, src, size = 'md', roleRing, className }: AvatarProps) {
  return <AvatarPrimitive.Root role="img" aria-label={name} className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary', roleRing && 'ring-2 ring-primary ring-offset-2 ring-offset-bg', sizes[size], className)}>{src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}<AvatarPrimitive.Fallback delayMs={src ? 400 : 0}>{initials(name) || '?'}</AvatarPrimitive.Fallback></AvatarPrimitive.Root>;
}
export function AvatarStack({ people, max = 3 }: { people: AvatarProps[]; max?: number }) {
  const visible = people.slice(0, max);
  return <div role="group" className="flex -space-x-2" aria-label={people.map((person) => person.name).join(', ')}>{visible.map((person) => <Avatar key={person.name} {...person} size="sm" className="ring-2 ring-surface" />)}{people.length > max && <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-sunken text-xs font-medium text-fg-muted ring-2 ring-surface">+{people.length - max}</span>}</div>;
}
