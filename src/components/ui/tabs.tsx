import { Tabs as T } from "radix-ui";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tabs({ className, ...props }: T.TabsProps) {
  return <T.Root className={cn("max-w-full min-w-0", className)} {...props} />;
}
export const TabsContent = T.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <T.List
      className={cn(
        "bg-surface-2 inline-flex max-w-full scrollbar-thin gap-1 overflow-x-auto rounded-xl p-1",
        className,
      )}
    >
      {children}
    </T.List>
  );
}

export function TabsTrigger({
  value,
  children,
  count,
  className,
}: {
  value: string;
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <T.Trigger
      value={value}
      className={cn(
        "text-muted hover:text-text data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-card inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className="tabular bg-surface-2 text-muted data-[state=active]:bg-primary-soft rounded-full px-1.5 text-xs">
          {count}
        </span>
      )}
    </T.Trigger>
  );
}

// ---- Filter tabs --------------------------------------------------------------------------------
// Same look and API as Tabs, for tab bars that filter one list instead of switching panels. They
// render as a group of pressed/unpressed buttons, so there are no orphaned aria-controls.

const FilterCtx = createContext<{ value: string; set: (v: string) => void }>({ value: "", set: () => {} });

export function FilterTabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <FilterCtx.Provider value={{ value, set: onValueChange }}>
      <div className={cn("max-w-full min-w-0", className)}>{children}</div>
    </FilterCtx.Provider>
  );
}

export function FilterTabsList({
  children,
  className,
  label = "Filter",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "bg-surface-2 inline-flex max-w-full scrollbar-thin gap-1 overflow-x-auto rounded-xl p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterTab({
  value,
  children,
  count,
  className,
}: {
  value: string;
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  const ctx = useContext(FilterCtx);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => ctx.set(value)}
      className={cn(
        "text-muted hover:text-text aria-pressed:bg-surface aria-pressed:text-text aria-pressed:shadow-card inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className="tabular bg-surface-2 text-muted rounded-full px-1.5 text-xs">{count}</span>
      )}
    </button>
  );
}
