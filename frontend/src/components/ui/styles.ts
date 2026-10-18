/**
 * Shared class recipes for screens that need an unlabelled/native control.
 * Prefer Input, Select, Textarea, Button and Card when their APIs fit; use
 * these recipes for compact filters, table rows and legacy form layouts.
 */
export const controlClass =
  'min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle';

export const labelClass = 'block space-y-1.5 text-sm font-medium text-fg';

export const cardClass = 'rounded-card border border-border bg-surface p-5 text-fg';

export const primaryActionClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-primary-hover hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const secondaryActionClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-fg transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-surface-sunken hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const dangerActionClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-danger bg-danger px-4 py-2 text-sm font-medium text-primary-fg transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-danger-fg hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const linkClass = 'font-medium text-primary underline-offset-2 hover:underline';
