import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/components/ui/badge";

const CHIP: Record<string, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info-text",
  violet: "bg-violet-soft text-violet-text",
  teal: "bg-teal-soft text-teal-text",
  outline: "bg-surface-2 text-muted",
};
const TINT: Record<string, string> = {
  danger: "border-[color-mix(in_oklch,var(--danger)_35%,var(--border))] bg-danger-soft",
  warning: "border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] bg-warning-soft",
  success: "border-[color-mix(in_oklch,var(--success)_35%,var(--border))] bg-success-soft",
};

export interface StatTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: Tone;
  /** Tinted warning state (e.g. Absent > 0 → danger). */
  tinted?: boolean;
  hint?: string;
  delta?: { value: number; suffix?: string; positiveIsGood?: boolean; label?: string } | null;
  className?: string;
  size?: "md" | "sm";
}

export function StatTile({ label, value, icon: Icon, tone = "neutral", tinted, hint, delta, className, size = "md" }: StatTileProps) {
  const good = delta ? (delta.positiveIsGood ?? true) === delta.value >= 0 : true;
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-4 shadow-card", tinted && TINT[tone], className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", CHIP[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className={cn("tabular mt-1 font-semibold tracking-tight", size === "md" ? "text-3xl" : "text-2xl", tinted && tone === "danger" && "text-danger-text")}>{value}</p>
      {(hint || delta) && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {delta && delta.value !== 0 && (
            <span className={cn("tabular inline-flex items-center font-medium", good ? "text-success-text" : "text-danger-text")}>
              {delta.value > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
              {Math.abs(delta.value)}
              {delta.suffix ?? ""}
            </span>
          )}
          {delta && delta.value !== 0 && <span>{delta.label ?? "vs previous period"}</span>}
          {hint && <span>{hint}</span>}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid place-items-center px-4 py-12 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-3 font-medium">{title}</p>
      {description && <p className="mt-0.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
