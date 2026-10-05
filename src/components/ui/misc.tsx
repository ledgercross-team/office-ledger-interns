import { Checkbox as C, Switch as S, Tooltip as T, Popover as P, Progress as Pr } from "radix-ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Checkbox({ className, ...props }: C.CheckboxProps) {
  return (
    <C.Root
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-md border border-border bg-surface transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

export function Switch({ className, ...props }: S.SwitchProps) {
  return (
    <S.Root
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full bg-border transition-colors duration-150 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-150 data-[state=checked]:translate-x-[1.125rem] rtl:data-[state=checked]:-translate-x-[1.125rem]" />
    </S.Root>
  );
}

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg bg-text px-2.5 py-1.5 text-xs text-bg shadow-pop">
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ children, className, align = "end" }: { children: ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={6} className={cn("z-50 rounded-xl border border-border bg-surface p-3 shadow-pop", className)}>
        {children}
      </P.Content>
    </P.Portal>
  );
}

export function Progress({ value, tone = "primary", label }: { value: number; tone?: "primary" | "success" | "danger" | "warning"; label: string }) {
  const color = { primary: "bg-primary", success: "bg-success", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <Pr.Root value={value} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <Pr.Indicator className={cn("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </Pr.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

const AVATAR_TONES = ["bg-primary-soft text-primary", "bg-success-soft text-success-text", "bg-violet-soft text-violet-text", "bg-teal-soft text-teal-text", "bg-warning-soft text-warning-text", "bg-info-soft text-info-text"];

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, image, size = "md", className }: { name: string; image?: string | null; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sz = { sm: "size-7 text-[0.65rem]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-20 text-xl" }[size];
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return image ? (
    <img src={image} alt="" className={cn("shrink-0 rounded-full object-cover", sz, className)} />
  ) : (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-semibold", sz, tone, className)}>
      {initials(name)}
    </span>
  );
}
