export function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning';
}) {
  const alert = tone === 'warning' && Number(value) > 0;

  return (
    <div className="rounded-xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
      <p className="text-sm text-charcoal-soft">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert ? 'text-alert-deep' : 'text-charcoal'}`}>
        {value}
      </p>
    </div>
  );
}
