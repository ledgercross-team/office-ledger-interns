import { Tabs as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <T.List className={cn("scrollbar-thin inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1", className)}>
      {children}
    </T.List>
  );
}

export function TabsTrigger({ value, children, count, className }: { value: string; children: ReactNode; count?: number; className?: string }) {
  return (
    <T.Trigger
      value={value}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:text-text data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-card",
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className="tabular rounded-full bg-surface-2 px-1.5 text-xs text-muted data-[state=active]:bg-primary-soft">{count}</span>
      )}
    </T.Trigger>
  );
}
