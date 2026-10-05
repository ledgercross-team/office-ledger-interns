/** Dependency-free sparkline (kept out of the Recharts chunk). */
/** Tiny trend line (no axes) with an end dot; nulls are gaps. */
export function Sparkline({
  values,
  label,
  width = 72,
  height = 22,
}: {
  values: (number | null)[];
  label: string;
  width?: number;
  height?: number;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <span className="text-muted text-xs">—</span>;
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums, 100);
  const x = (i: number) => 2 + (i * (width - 6)) / (values.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const lastIdx = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  const lastVal = values[lastIdx]!;
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      <title>{label}</title>
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(lastIdx)}
        cy={y(lastVal)}
        r={3}
        fill="var(--primary)"
        stroke="var(--surface)"
        strokeWidth={2}
      />
    </svg>
  );
}
