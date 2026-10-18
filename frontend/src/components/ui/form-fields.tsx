'use client';

import { Checkbox as CheckboxPrimitive, RadioGroup, Switch as SwitchPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import {
  forwardRef,
  useId,
  useMemo,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const control =
  'min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle';

interface FieldFrameProps {
  id: string;
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  children: ReactNode;
}

function FieldFrame({ id, label, required, helperText, error, children }: FieldFrameProps) {
  const descriptionId = helperText || error ? `${id}-description` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="ml-1 text-danger-fg" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {(error || helperText) && (
        <p
          id={descriptionId}
          className={cn('text-xs', error ? 'text-danger-fg' : 'text-fg-muted')}
          role={error ? 'alert' : undefined}
        >
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id: givenId, label, helperText, error, required, className, ...props },
  ref,
) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <FieldFrame id={id} label={label} required={required} helperText={helperText} error={error}>
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={helperText || error ? `${id}-description` : undefined}
        className={cn(control, error && 'border-danger', className)}
        {...props}
      />
    </FieldFrame>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id: givenId, label, helperText, error, required, className, ...props },
  ref,
) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <FieldFrame id={id} label={label} required={required} helperText={helperText} error={error}>
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={helperText || error ? `${id}-description` : undefined}
        className={cn(control, 'min-h-24 resize-y', error && 'border-danger', className)}
        {...props}
      />
    </FieldFrame>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  helperText?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id: givenId, label, helperText, error, required, className, children, ...props },
  ref,
) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <FieldFrame id={id} label={label} required={required} helperText={helperText} error={error}>
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={helperText || error ? `${id}-description` : undefined}
        className={cn(control, error && 'border-danger', className)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
});

export interface ComboboxOption {
  value: string;
  label: string;
}
export interface ComboboxProps extends Omit<InputProps, 'type'> {
  options: ComboboxOption[];
}
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { options, id: givenId, ...props },
  ref,
) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <>
      <Input ref={ref} id={id} list={`${id}-options`} autoComplete="off" {...props} />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
    </>
  );
});

interface ChoiceProps {
  label: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
}
export function Checkbox({
  label,
  helperText,
  disabled,
  required,
  ...props
}: ChoiceProps & React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const id = useId();
  const helperId = helperText ? `${id}-helper` : undefined;
  return (
    <div className="flex items-start gap-2.5">
      <CheckboxPrimitive.Root
        id={id}
        disabled={disabled}
        required={required}
        aria-describedby={helperId}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface text-primary disabled:opacity-50"
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-4" aria-hidden />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {required && <span className="ml-1 text-danger-fg">*</span>}
        </label>
        {helperText && (
          <p id={helperId} className="text-xs text-fg-muted">
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}

export interface RadioOption {
  value: string;
  label: string;
  helperText?: string;
}
export function Radio({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  helperText,
}: ChoiceProps & {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const labelId = useId();
  const helperId = helperText ? `${labelId}-helper` : undefined;
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend id={labelId} className="text-sm font-medium text-fg">
        {label}
        {required && <span className="ml-1 text-danger-fg">*</span>}
      </legend>
      <RadioGroup.Root
        aria-labelledby={labelId}
        aria-describedby={helperId}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        required={required}
        className="space-y-2"
      >
        {options.map((option) => (
          <label key={option.value} className="flex items-start gap-2.5 text-sm text-fg">
            <RadioGroup.Item
              value={option.value}
              className="mt-0.5 flex size-5 items-center justify-center rounded-full border border-border-strong bg-surface"
            >
              <RadioGroup.Indicator className="size-2.5 rounded-full bg-primary" />
            </RadioGroup.Item>
            <span>
              {option.label}
              {option.helperText && (
                <span className="block text-xs text-fg-muted">{option.helperText}</span>
              )}
            </span>
          </label>
        ))}
      </RadioGroup.Root>
      {helperText && (
        <p id={helperId} className="text-xs text-fg-muted">
          {helperText}
        </p>
      )}
    </fieldset>
  );
}

export function Switch({
  label,
  helperText,
  disabled,
  checked,
  defaultChecked,
  onCheckedChange,
}: ChoiceProps & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const id = useId();
  const helperId = helperText ? `${id}-helper` : undefined;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {helperText && (
          <p id={helperId} className="text-xs text-fg-muted">
            {helperText}
          </p>
        )}
      </div>
      <SwitchPrimitive.Root
        id={id}
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        aria-describedby={helperId}
        className="relative h-6 w-11 shrink-0 rounded-full border border-border-strong bg-surface-sunken data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0 rounded-full bg-surface-raised shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
    </div>
  );
}

export interface TimezoneSelectProps extends Omit<SelectProps, 'children'> {
  defaultValue?: string;
}
function timezoneLabel(timezone: string): string {
  const city = timezone.split('/').at(-1)?.replaceAll('_', ' ') ?? timezone;
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  return `${city} (${offset.replace('GMT', 'UTC')})`;
}
export { timezoneLabel };
export const TimezoneSelect = forwardRef<HTMLSelectElement, TimezoneSelectProps>(
  function TimezoneSelect({ defaultValue = 'UTC', ...props }, ref) {
    const options = useMemo(() => {
      const zones = [
        'UTC',
        ...Intl.supportedValuesOf('timeZone').filter((zone) => !zone.startsWith('Etc/')),
      ];
      if (!zones.includes(defaultValue)) zones.unshift(defaultValue);
      return zones;
    }, [defaultValue]);
    return (
      <Select ref={ref} defaultValue={defaultValue} name={props.name ?? props.id} {...props}>
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {timezoneLabel(zone)}
          </option>
        ))}
      </Select>
    );
  },
);
