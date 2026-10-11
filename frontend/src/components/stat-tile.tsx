export function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p
        className={`text-2xl font-semibold ${tone === 'warning' && Number(value) > 0 ? 'text-red-600' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
