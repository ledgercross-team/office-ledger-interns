'use client';

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const displayedDate = isControlled ? value : selectedDate;

  useEffect(() => {
    if (!isControlled) {
      // Server-refreshed forms can receive a new default while the component stays mounted.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDate(typeof defaultValue === 'string' ? defaultValue : '');
    }
  }, [defaultValue, isControlled]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isControlled) setSelectedDate(event.target.value);
    onChange?.(event);
  }

  function openPicker() {
    const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;
    if (input.showPicker) {
      input.showPicker();
    } else {
      input.click();
    }
  }

  return (
    <div className={`relative focus-within:border-evergreen ${className}`}>
      <input
        ref={inputRef}
        {...props}
        type="date"
        lang="en-GB"
        value={value !== undefined ? value : selectedDate}
        onChange={handleChange}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label={displayedDate ? `Choose date, ${formatDate(displayedDate)}` : 'Choose date'}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[inherit] bg-transparent px-3 py-2 text-left outline-none focus:border-evergreen"
      >
        <span className={displayedDate ? 'text-charcoal' : 'text-charcoal-soft'}>
          {displayedDate ? formatDate(displayedDate) : 'Select date'}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-charcoal-soft"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
