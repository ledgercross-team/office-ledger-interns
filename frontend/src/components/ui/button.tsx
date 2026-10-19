'use client';

import { Slot, Tooltip } from 'radix-ui';
import { LoaderCircle } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary text-primary-fg shadow-[0_1px_2px_rgb(17_17_17_/_0.12)] hover:bg-primary-hover',
  secondary:
    'border-border-strong bg-surface-raised text-fg shadow-[0_1px_2px_rgb(17_17_17_/_0.04)] hover:bg-surface-sunken',
  ghost: 'border-transparent bg-transparent text-fg hover:bg-surface-sunken',
  danger: 'border-danger bg-danger text-primary-fg hover:bg-danger-fg',
};

/**
 * Read-only mode (UI-SPEC §5): the shell provides a reason while the org is
 * read-only. A Button marked `mutates` stays visible but is disabled with it.
 */
const ReadOnlyReasonContext = createContext<string | null>(null);
export const ReadOnlyProvider = ReadOnlyReasonContext.Provider;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  disabledReason?: string;
  iconOnly?: boolean;
  /** Changes data: disabled, with the reason, while the org is read-only. */
  mutates?: boolean;
  asChild?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Working',
    disabledReason: disabledReasonProp,
    iconOnly = false,
    mutates = false,
    asChild = false,
    className,
    disabled: disabledProp,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const readOnlyReason = useContext(ReadOnlyReasonContext);
  const blockedByReadOnly = mutates && readOnlyReason !== null;
  const disabled = disabledProp || blockedByReadOnly;
  const disabledReason = blockedByReadOnly ? readOnlyReason : disabledReasonProp;
  const isDisabled = disabled || loading;
  const classes = cn(
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-control border font-medium transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 ease-out enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97] motion-reduce:transform-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'min-h-8 px-3 py-1 text-xs' : 'min-h-10 px-4 py-2 text-sm',
    'tracking-[-0.01em]',
    iconOnly && (size === 'sm' ? 'min-w-8 px-1' : 'min-w-10 px-2'),
    variants[variant],
    className,
  );
  const content = loading ? (
    <>
      <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      <span>{loadingLabel}</span>
    </>
  ) : (
    children
  );
  const control = asChild ? (
    <Slot.Slot className={classes}>{children}</Slot.Slot>
  ) : (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {content}
    </button>
  );

  if (!disabledReason || !isDisabled) return control;
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex" tabIndex={0}>
            {control}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-50 max-w-64 rounded-control bg-fg px-3 py-2 text-xs text-bg shadow-float motion-fade"
          >
            {disabledReason}
            <Tooltip.Arrow className="fill-fg" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
});
