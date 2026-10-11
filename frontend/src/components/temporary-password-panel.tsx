'use client';

import { useState } from 'react';

// The password lives only in the caller's state, so it is gone once the page is left.
export function TemporaryPasswordPanel({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      aria-label="Temporary password"
      className="space-y-2 rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950"
    >
      <p className="font-medium">Temporary password</p>
      <p className="flex flex-wrap items-center gap-3">
        <code className="rounded bg-white px-2 py-1 font-mono text-base">{password}</code>
        <button type="button" onClick={() => void copy()} className="rounded border bg-white px-3 py-1 text-sm">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p className="text-sm">This is shown only once. They must change it at first login.</p>
    </section>
  );
}
