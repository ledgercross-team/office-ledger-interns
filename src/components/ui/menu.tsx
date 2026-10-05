import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-pop data-[state=open]:animate-[fade-in_120ms_ease-out]", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: M.DropdownMenuItemProps) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function MenuCheckboxItem({ className, children, ...props }: M.DropdownMenuCheckboxItemProps) {
  return (
    <M.CheckboxItem
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2", className)}
      onSelect={(e) => e.preventDefault()}
      {...props}
    >
      <span className="grid size-4 place-items-center rounded border border-border">
        <M.ItemIndicator>
          <svg viewBox="0 0 12 12" className="size-3 text-primary" aria-hidden>
            <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  );
}

export function MenuRadioGroup(props: M.DropdownMenuRadioGroupProps) {
  return <M.RadioGroup {...props} />;
}
export function MenuRadioItem({ className, children, ...props }: M.DropdownMenuRadioItemProps) {
  return (
    <M.RadioItem
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted", className)}
      {...props}
    >
      {children}
      <M.ItemIndicator className="ms-auto size-2 rounded-full bg-primary" />
    </M.RadioItem>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-2.5 py-1.5 text-xs font-medium text-muted">{children}</M.Label>;
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
