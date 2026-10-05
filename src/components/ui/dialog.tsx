import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlay =
  "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out] data-[state=closed]:animate-[fade-out_120ms_ease-in]";

export function DialogContent({
  title,
  description,
  children,
  className,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-pop data-[state=open]:animate-[pop-in_180ms_ease-out]",
          className,
        )}
      >
        <div className="pe-8">
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
          )}
        </div>
        {children}
        {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
        <D.Close className="absolute end-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

/** Side sheet (drawer) built on Dialog. */
export function SheetContent({
  title,
  description,
  children,
  side = "right",
  className,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  side?: "right" | "left";
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full max-w-md flex-col border-border bg-surface shadow-pop",
          side === "right"
            ? "end-0 border-s data-[state=open]:animate-[slide-in-right_200ms_ease-out]"
            : "start-0 border-e data-[state=open]:animate-[slide-in-left_200ms_ease-out]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-base font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Panel"}</D.Description>
            )}
          </div>
          <D.Close className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}
