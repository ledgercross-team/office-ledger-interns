import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { actions } from "astro:actions";
import { navigate } from "astro:transitions/client";
import { toast } from "sonner";
import { ArrowRight, Clock3, KanbanSquare, Loader2, Plane, Plus, UserRound } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import type { SearchHit } from "@/lib/queries/shell";
import { NAV_ICONS } from "./icons";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nav: Pick<NavItem, "label" | "href" | "icon">[];
  canCheckIn: boolean;
  canRequestLeave: boolean;
}

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";

export default function CommandPalette({ open, onOpenChange, nav, canCheckIn, canRequestLeave }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await actions.shell.search({ q: q.trim() });
      setHits(data ?? []);
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    onOpenChange(false);
    void navigate(href);
  };

  async function checkIn() {
    onOpenChange(false);
    const { data, error } = await actions.attendance.checkIn({ mode: "office" });
    if (error) return toast.error(error.message);
    toast.success(data.message);
  }

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Jump to a page, employee or task, or run a quick action.</D.Description>
          <Command label="Command palette" shouldFilter={true} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search pages, people, tasks…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
              {loading && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">No results.</Command.Empty>
              <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {canCheckIn && (
                  <Command.Item value="check in clock in attendance" onSelect={checkIn} className={itemCls}>
                    <Clock3 aria-hidden /> Check in
                  </Command.Item>
                )}
                <Command.Item value="new task create" onSelect={() => go("/app/tasks?new=1")} className={itemCls}>
                  <Plus aria-hidden /> New task
                </Command.Item>
                {canRequestLeave && (
                  <Command.Item value="request leave time off holiday" onSelect={() => go("/app/leave?new=1")} className={itemCls}>
                    <Plane aria-hidden /> Request leave
                  </Command.Item>
                )}
              </Command.Group>
              <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {[...nav, { label: "My Profile", href: "/app/me", icon: "profile" as const }].map((n) => {
                  const Icon = NAV_ICONS[n.icon];
                  return (
                    <Command.Item key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)} className={itemCls}>
                      <Icon aria-hidden /> {n.label}
                      <ArrowRight className="ms-auto opacity-0 [[aria-selected=true]_&]:opacity-100" aria-hidden />
                    </Command.Item>
                  );
                })}
              </Command.Group>
              {hits.length > 0 && (
                <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {hits.map((h) => (
                    <Command.Item key={`${h.type}-${h.id}`} value={`${h.type} ${h.title} ${h.subtitle} ${q}`} onSelect={() => go(h.href)} className={itemCls}>
                      {h.type === "employee" ? <UserRound aria-hidden /> : <KanbanSquare aria-hidden />}
                      <span className="min-w-0">
                        <span className="block truncate">{h.title}</span>
                        <span className="block truncate text-xs capitalize text-muted">{h.subtitle}</span>
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
