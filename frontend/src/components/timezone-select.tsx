import { useMemo } from 'react';

interface TimezoneOption {
  value: string;
  label: string;
}

interface TimezoneSelectProps {
  id: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}

function offsetLabel(timezone: string): string {
  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!value || value === 'GMT') return 'UTC';

  const match = value.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return value.replace(/^GMT/, 'UTC ');

  return `UTC ${match[1]}${Number(match[2])}.${match[3]}`;
}

function fixedOffsetZone(offset: number): string {
  if (offset === 0) return 'UTC';
  // Etc/GMT uses the opposite sign: Etc/GMT-6 means UTC+06:00.
  return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

function fixedOffsetLabel(offset: number): string {
  if (offset === 0) return 'UTC';

  const sign = offset >= 0 ? '+' : '-';
  return `UTC ${sign}${Math.abs(offset)}.00 (fixed offset)`;
}

function cityName(timezone: string): string {
  const segments = timezone.split('/');
  return segments[segments.length - 1].replace(/_/g, ' ');
}

export function timezoneLabel(timezone: string): string {
  const fixed = timezone.match(/^Etc\/GMT([+-])(\d{1,2})$/);
  if (fixed) {
    const offset = Number(fixed[2]) * (fixed[1] === '-' ? 1 : -1);
    return fixedOffsetLabel(offset);
  }
  return `${cityName(timezone)} (${offsetLabel(timezone)})`;
}

function timezoneOptions(defaultValue: string): TimezoneOption[] {
  const fixed = Array.from({ length: 27 }, (_, index) => index - 12).map((offset) => ({
    value: fixedOffsetZone(offset),
    label: fixedOffsetLabel(offset),
  }));

  const regions = Intl.supportedValuesOf('timeZone')
    .filter((timezone) => !timezone.startsWith('Etc/'))
    .sort()
    .map((timezone) => ({
      value: timezone,
      label: timezoneLabel(timezone),
    }));

  const options = [...fixed, ...regions];
  if (defaultValue && !options.some((option) => option.value === defaultValue)) {
    options.unshift({ value: defaultValue, label: timezoneLabel(defaultValue) });
  }
  return options;
}

export function TimezoneSelect({
  id,
  label,
  defaultValue = 'UTC',
  required = true,
}: TimezoneSelectProps) {
  const options = useMemo(() => timezoneOptions(defaultValue), [defaultValue]);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
