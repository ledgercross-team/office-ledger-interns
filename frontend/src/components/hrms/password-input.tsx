'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui';

/** A password field with the same show/hide button as the login page. */
export function PasswordInput({ className, ...props }: Omit<InputProps, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={`pr-11 ${className ?? ''}`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-8 inline-flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {shown ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
      </button>
    </div>
  );
}
