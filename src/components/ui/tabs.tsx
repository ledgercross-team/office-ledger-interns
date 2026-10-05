import { Tabs as T } from "radix-ui";
import type { ReactNode } from "react";
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
