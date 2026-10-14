'use client';

import { CalendarDays } from 'lucide-react';
import { forwardRef, useId, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { Checkbox } from './form-fields';
import { cn } from '@/lib/cn';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hideLabel?: boolean;
  helperText?: string;
  error?: string;
  timezone?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { id: givenId, label, hideLabel, helperText, error, timezone, required, className, ...props }, ref,
) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={cn('text-sm font-medium text-fg', hideLabel ? 'sr-only' : 'block')}>{label}{required && <span className="ml-1 text-danger-fg">*</span>}</label>
      <div className="relative"><input ref={ref} id={id} type="date" required={required} aria-invalid={Boolean(error)} aria-describedby={helperText || error || timezone ? `${id}-description` : undefined} className={cn('min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 pr-10 text-sm text-fg disabled:bg-surface-sunken', error && 'border-danger', className)} {...props} /><CalendarDays aria-hidden className="pointer-events-none absolute right-3 top-2.5 size-5 text-fg-muted" /></div>
      {(error || helperText || timezone) && <p id={`${id}-description`} role={error ? 'alert' : undefined} className={cn('text-xs', error ? 'text-danger-fg' : 'text-fg-muted')}>{error ?? helperText}{!error && timezone && <span>{helperText ? ' · ' : ''}{timezone}</span>}</p>}
    </div>
  );
});

export type HalfDay = 'none' | 'morning' | 'afternoon';
export interface DateRangeValue { start: string; end: string; startHalf: boolean; endHalf: boolean }
export interface DateRangePickerProps { label: string; value: DateRangeValue; onChange: (value: DateRangeValue) => void; error?: string; timezone?: string; disabled?: boolean; required?: boolean }
export function DateRangePicker({ label, value, onChange, error, timezone, disabled, required }: DateRangePickerProps) {
  const updateDate = (key: 'start' | 'end') => (event: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: event.target.value });
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-card border border-border p-4"><legend className="px-1 text-sm font-medium text-fg">{label}{required && <span className="ml-1 text-danger-fg">*</span>}</legend>
      <div className="grid gap-3 sm:grid-cols-2"><DatePicker label="Start date" value={value.start} onChange={updateDate('start')} required={required} timezone={timezone} /><DatePicker label="End date" value={value.end} onChange={updateDate('end')} required={required} min={value.start || undefined} timezone={timezone} /></div>
      <div className="grid gap-2 sm:grid-cols-2"><Checkbox label="First day is a half day" checked={value.startHalf} onCheckedChange={(checked) => onChange({ ...value, startHalf: checked === true })} /><Checkbox label="Last day is a half day" checked={value.endHalf} onCheckedChange={(checked) => onChange({ ...value, endHalf: checked === true })} /></div>
      {error && <p role="alert" className="text-xs text-danger-fg">{error}</p>}
    </fieldset>
  );
}

export function TimeInput(props: Omit<DatePickerProps, 'type'>) {
  const { label, helperText, error, timezone, id, required, className, ...rest } = props;
  const generated = useId();
  const inputId = id ?? generated;
  return <div className="space-y-1.5"><label htmlFor={inputId} className="block text-sm font-medium text-fg">{label}{required && <span className="ml-1 text-danger-fg">*</span>}</label><input id={inputId} type="time" required={required} aria-invalid={Boolean(error)} className={cn('min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg', error && 'border-danger', className)} {...rest} />{(error || helperText || timezone) && <p role={error ? 'alert' : undefined} className={cn('text-xs', error ? 'text-danger-fg' : 'text-fg-muted')}>{error ?? helperText}{!error && timezone && ` · ${timezone}`}</p>}</div>;
}
