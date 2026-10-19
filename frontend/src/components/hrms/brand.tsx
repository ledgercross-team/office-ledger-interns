import Link from 'next/link';
import { cn } from '@/lib/cn';

export function BrandMark({
  className,
  label = 'Office Ledger',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-[0.8rem] bg-primary text-[0.72rem] font-bold uppercase tracking-[0.08em] text-primary-fg shadow-sm',
        className,
      )}
    >
      OL
    </span>
  );
}

export function BrandLink({
  href = '/landing',
  inverse = false,
  className,
}: {
  href?: string;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-control outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary',
        className,
      )}
    >
      <BrandMark />
      <span
        className={cn(
          'min-w-0 truncate text-sm font-bold tracking-tight',
          inverse ? 'text-rail-fg' : 'text-fg',
        )}
      >
        Office Ledger
      </span>
    </Link>
  );
}
