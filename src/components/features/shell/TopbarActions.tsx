import { useEffect, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { navigate } from "astro:transitions/client";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  Pin,
  Plus,
  Search,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar, Switch } from "@/components/ui/misc";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { AppToaster, onLiveNotification, startLive, withQuery } from "../query";
import CommandPalette from "./CommandPalette";
import type { NavItem } from "@/lib/nav";
import type { ThemeMode } from "@/lib/auth-types";

interface Props {
  user: { name: string; email: string; image: string | null };
  role: string;
  counts: { inbox: number; notifications: number; announcements: number };
  theme: ThemeMode;
  nav: Pick<NavItem, "label" | "href" | "icon">[];
  canPost: boolean;
  canCheckIn: boolean;
  canRequestLeave: boolean;
}

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function CountBadge({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return (
    <span className="tabular absolute -end-0.5 -top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[0.65rem] font-semibold text-white" aria-label={label}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function NotificationsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => actions.notifications.list.orThrow(),
    enabled: open,
  });
  const groups = useMemo(() => {
    const m = new Map<string, typeof data>();
    for (const n of data) {
      const k = dayLabel(new Date(n.createdAt));
      m.set(k, [...(m.get(k) ?? []), n]);
    }
    return [...m.entries()];
  }, [data]);
  const markAll = async () => {
    await actions.notifications.markRead({});
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    void qc.invalidateQueries({ queryKey: ["shell"] });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Notifications"
        description="Updates about your requests, tasks and approvals."
        footer={
          <Button variant="ghost" size="sm" onClick={markAll}>
            <CheckCheck aria-hidden /> Mark all as read
          </Button>
        }
      >
        {isLoading && <div className="grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>}
        {!isLoading && !data.length && (
          <div className="grid place-items-center py-16 text-center">
            <Bell className="size-8 text-muted" aria-hidden />
            <p className="mt-3 font-medium">You're all caught up</p>
            <p className="text-sm text-muted">New notifications will appear here instantly.</p>
          </div>
        )}
        <div className="grid gap-5">
          {groups.map(([day, items]) => (
            <section key={day} aria-label={day}>
              <h3 className="eyebrow mb-2">{day}</h3>
              <ul className="grid gap-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.link ?? "#"}
                      onClick={async () => {
                        if (!n.readAt) await actions.notifications.markRead({ id: n.id });
                        onOpenChange(false);
                      }}
                      className="flex gap-3 rounded-xl p-2.5 hover:bg-surface-2"
                    >
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} aria-label={n.readAt ? undefined : "Unread"} />
                      <span className="min-w-0">
                        <span className={`block text-sm ${n.readAt ? "text-muted" : "font-medium"}`}>{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                        <span className="text-xs text-muted">{new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Dialog>
  );
}

function AnnouncementsDrawer({ open, onOpenChange, canPost }: { open: boolean; onOpenChange: (o: boolean) => void; canPost: boolean }) {
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinned, setPinned] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => actions.announcements.list.orThrow(),
    enabled: open,
  });
  useEffect(() => {
    const unread = data.filter((a) => !a.read).map((a) => a.id);
    if (open && unread.length)
      void actions.announcements.markRead({ ids: unread }).then(() => qc.invalidateQueries({ queryKey: ["shell"] }));
  }, [open, data, qc]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["announcements"] });
  async function post(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setSaving(true);
    const { error } = await actions.announcements.create({
      title: f.title ?? "",
      body: f.body ?? "",
      pinned,
      expiresAt: f.expiresAt ? new Date(f.expiresAt) : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Announcement posted");
    setComposing(false);
    setPinned(false);
    void refresh();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Announcements"
        description="Workspace news from owners and managers."
        footer={
          canPost && !composing ? (
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus aria-hidden /> New announcement
            </Button>
          ) : undefined
        }
      >
        {composing && (
          <form onSubmit={post} className="mb-6 grid gap-3 rounded-2xl border border-border p-4">
            <Field label="Title" required>
              <Input name="title" maxLength={140} />
            </Field>
            <Field label="Message" hint="Markdown supported: **bold**, *italic*, lists and links." required>
              <Textarea name="body" rows={5} maxLength={8000} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Expires (optional)">
                <Input name="expiresAt" type="datetime-local" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Pin announcement" /> Pin to top
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={saving}>
                Post
              </Button>
            </div>
          </form>
        )}
        {isLoading && <div className="grid gap-3">{[0, 1].map((i) => <div key={i} className="skeleton h-24" />)}</div>}
        {!isLoading && !data.length && !composing && (
          <div className="grid place-items-center py-16 text-center">
            <Megaphone className="size-8 text-muted" aria-hidden />
            <p className="mt-3 font-medium">No announcements</p>
            <p className="text-sm text-muted">Workspace news will show up here.</p>
          </div>
        )}
        <ul className="grid gap-3">
          {data.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    {a.pinned && <Pin className="size-3.5 text-primary" aria-label="Pinned" />}
                    {!a.read && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
                    {a.title}
                  </p>
                  <p className="text-xs text-muted">
                    {a.authorName ?? "Someone"} · {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {a.expiresAt && ` · until ${new Date(a.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                {canPost && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={a.pinned ? "Unpin" : "Pin"}
                      onClick={async () => {
                        await actions.announcements.update({ id: a.id, pinned: !a.pinned });
                        void refresh();
                      }}
                    >
                      <Pin aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete announcement"
                      onClick={async () => {
                        if (!confirm("Delete this announcement?")) return;
                        await actions.announcements.remove({ id: a.id });
                        void refresh();
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
              {/* html is produced by the server-side sanitiser (src/lib/markdown.ts) */}
              <div className="prose-sm mt-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_li]:ms-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: a.html }} />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Dialog>
  );
}

function TopbarActions(props: Props) {
  const { user, role, theme: initialTheme } = props;
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [notifOpen, setNotifOpen] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: counts } = useQuery({
    queryKey: ["shell", "counts"],
    queryFn: () => actions.shell.counts.orThrow(),
    initialData: props.counts,
    initialDataUpdatedAt: Date.now(),
    refetchInterval: 120_000,
  });

  useEffect(() => {
    startLive();
    const off = onLiveNotification((n) =>
      toast(n.title, { description: n.body ?? undefined, action: n.link ? { label: "Open", onClick: () => navigate(n.link!) } : undefined }),
    );
    const params = new URLSearchParams(window.location.search);
    if (params.has("announcements")) setAnnOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // keep the sidebar's inbox badge in sync with live counts
  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-inbox-count]").forEach((el) => {
      el.textContent = String(counts.inbox);
      el.hidden = counts.inbox === 0;
    });
  }, [counts.inbox]);

  async function changeTheme(mode: ThemeMode) {
    setTheme(mode);
    document.documentElement.setAttribute("data-theme-mode", mode);
    (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
    await actions.workspace.setTheme({ theme: mode });
  }
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted transition-colors hover:bg-surface-2 md:flex"
      >
        <Search className="size-4" aria-hidden />
        <span>Search</span>
        <kbd className="ms-4 rounded-md border border-border bg-surface-2 px-1.5 text-[0.7rem] font-medium">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
        <Search aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" className="relative" aria-label={`Announcements${counts.announcements ? `, ${counts.announcements} unread` : ""}`} onClick={() => setAnnOpen(true)}>
        <Megaphone aria-hidden />
        {counts.announcements > 0 && <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />}
      </Button>
      <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`} onClick={() => setNotifOpen(true)}>
        <Bell aria-hidden />
        <CountBadge n={counts.notifications} label={`${counts.notifications} unread`} />
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}`}>
            <ThemeIcon aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent className="min-w-36">
          <MenuLabel>Theme</MenuLabel>
          <MenuRadioGroup value={theme} onValueChange={(v) => changeTheme(v as ThemeMode)}>
            <MenuRadioItem value="light"><Sun aria-hidden /> Light</MenuRadioItem>
            <MenuRadioItem value="dark"><Moon aria-hidden /> Dark</MenuRadioItem>
            <MenuRadioItem value="system"><Monitor aria-hidden /> System</MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="ms-1 rounded-full focus-visible:outline-2 focus-visible:outline-ring" aria-label="Account menu">
            <Avatar name={user.name} image={user.image} size="sm" />
          </button>
        </MenuTrigger>
        <MenuContent>
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email} · <span className="capitalize">{role}</span></p>
          </div>
          <MenuSeparator />
          <MenuItem onSelect={() => navigate("/app/me")}>
            <UserRound aria-hidden /> My profile
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Theme</MenuLabel>
          <MenuRadioGroup value={theme} onValueChange={(v) => changeTheme(v as ThemeMode)}>
            <MenuRadioItem value="light"><Sun aria-hidden /> Light</MenuRadioItem>
            <MenuRadioItem value="dark"><Moon aria-hidden /> Dark</MenuRadioItem>
            <MenuRadioItem value="system"><Monitor aria-hidden /> System</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem
            onSelect={async () => {
              await authClient.signOut();
              window.location.href = "/auth/sign-in";
            }}
          >
            <LogOut aria-hidden /> Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
      <NotificationsDrawer open={notifOpen} onOpenChange={setNotifOpen} />
      <AnnouncementsDrawer open={annOpen} onOpenChange={setAnnOpen} canPost={props.canPost} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={props.nav} canCheckIn={props.canCheckIn} canRequestLeave={props.canRequestLeave} />
      <AppToaster />
    </div>
  );
}

export default withQuery(TopbarActions);
