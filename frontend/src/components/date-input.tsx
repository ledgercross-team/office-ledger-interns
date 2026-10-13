'use client';

import { useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { formatDate } from '@/lib/format';

type DateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function DateInput({
  className = '',
  value,
  defaultValue,
  onChange,
  ...props
}: DateInputProps) {
  const isControlled = value !== undefined;
  const initialValue = typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : '';
  const [selectedDate, setSelectedDate] = useState(initialValue);
  const displayedDate = isControlled ? value : selectedDate;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isControlled) setSelectedDate(event.target.value);
    onChange?.(event);
  }

  return (
    <div className={`relative focus-within:border-evergreen ${className}`}>
      <input
        {...props}
        type="date"
        lang="en-GB"
        value={value !== undefined ? value : selectedDate}
        onChange={handleChange}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <span aria-hidden="true" className="flex min-h-11 items-center px-3 py-2 text-charcoal">
        {displayedDate ? formatDate(displayedDate) : 'Select date'}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-charcoal-soft"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </div>
  );
}
