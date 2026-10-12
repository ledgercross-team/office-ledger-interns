'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate, fromZonedInput, toZonedInput } from '@/lib/format';
import type { AttendanceRecord } from '@/lib/types';

interface CorrectionDialogProps {
  record: AttendanceRecord;
  personName: string;
  timezone: string;
  onClose: () => void;
}

export function CorrectionDialog({ record, personName, timezone, onClose }: CorrectionDialogProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { checkInAt: string; checkOutAt?: string; note: string }) =>
      apiFetch(`/attendance/${record.id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checkIn = String(form.get('checkInAt'));
    const checkOut = String(form.get('checkOutAt'));

    setError(null);
    save.mutate({
      checkInAt: fromZonedInput(checkIn, timezone),
      checkOutAt: checkOut ? fromZonedInput(checkOut, timezone) : undefined,
      note: note.trim(),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-title"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
    >
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-3 rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_8px_24px_rgba(19,78,58,0.12)]">
        <h2 id="correction-title" className="font-semibold text-charcoal">
          Correct attendance: {personName}, {formatDate(record.workDate)}
        </h2>
        <p className="text-sm text-charcoal-soft">Times are in the company timezone ({timezone}).</p>

        <div className="space-y-1">
          <label htmlFor="checkInAt" className="block text-sm font-medium text-charcoal">
            Check in
          </label>
          <input
            id="checkInAt"
            name="checkInAt"
            type="datetime-local"
            required
            defaultValue={toZonedInput(record.checkInAt, timezone)}
            className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="checkOutAt" className="block text-sm font-medium text-charcoal">
            Check out
          </label>
          <input
            id="checkOutAt"
            name="checkOutAt"
            type="datetime-local"
            defaultValue={record.checkOutAt ? toZonedInput(record.checkOutAt, timezone) : ''}
            className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="note" className="block text-sm font-medium text-charcoal">
            Note (required)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required
            maxLength={500}
            rows={3}
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-charcoal/15 px-4 py-2 text-sm font-medium hover:bg-mist">
            Close
          </button>
          <button
            type="submit"
            disabled={save.isPending || note.trim() === ''}
            className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-evergreen-dark disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </div>
  );
}
