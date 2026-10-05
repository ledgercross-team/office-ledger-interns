import { useEffect, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarRange,
  Clock,
  Crown,
  Download,
  Eye,
  History,
  Lock,
  Plus,
  ShieldCheck,
  Timer,
  Trash2,
} from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { SettingsData } from "@/actions/settings";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Avatar, Switch } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatTile } from "@/components/layout/StatTile";
import OrgItemsEditor from "../employees/OrgItemsEditor";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const APPROVAL = { none: "Not required", late: "Late only", remote: "Remote only", both: "Both" } as const;

function useSave() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T>(
    key: string,
    fn: () => Promise<{ error?: { message: string }; data?: T }>,
    ok = "Settings saved",
  ) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) {
      toast.error(res.error.message);
      return false;
    }
    toast.success(ok);
    void qc.invalidateQueries({ queryKey: ["settings"] });
    return true;
  }
  return { busy, run, qc };
}

function SaveBar({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  if (disabled) return null;
  return (
    <div className="border-border flex justify-end border-t pt-4">
      <Button type="submit" loading={busy}>
        Save changes
      </Button>
    </div>
  );
}

function PolicyTab({ d, ro }: { d: SettingsData; ro: boolean }) {
  const { busy, run } = useSave();
  const [f, setF] = useState(d.settings);
  const [ips, setIps] = useState(d.settings.geo.allowedIps.join("\n"));
  useEffect(() => setF(d.settings), [d.settings]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run("policy", () =>
          actions.settings.policy({
            officeStart: f.officeStart,
            officeEnd: f.officeEnd,
            lateThresholdMin: Number(f.lateThresholdMin),
            remoteDaysPerWeek: Number(f.remoteDaysPerWeek),
            approvalMode: f.approvalMode,
            autoCheckoutAt: f.autoCheckoutAt || null,
            geo: {
              ...f.geo,
              radiusM: Number(f.geo.radiusM),
              allowedIps: ips.split(/[\s,]+/).filter(Boolean),
            },
          }),
        );
      }}
    >
      <fieldset disabled={ro} className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Office start time">
            <Input
              type="time"
              value={f.officeStart}
              onChange={(e) => setF({ ...f, officeStart: e.target.value })}
            />
          </Field>
          <Field label="Office end time" hint="The daily report locks at this time.">
            <Input
              type="time"
              value={f.officeEnd}
              onChange={(e) => setF({ ...f, officeEnd: e.target.value })}
            />
          </Field>
          <Field label="Late threshold (minutes)">
            <Input
              type="number"
              min={0}
              max={240}
              value={f.lateThresholdMin}
              onChange={(e) => setF({ ...f, lateThresholdMin: Number(e.target.value) })}
            />
          </Field>
          <Field label="Remote days per week">
            <Input
              type="number"
              min={0}
              max={7}
              value={f.remoteDaysPerWeek}
              onChange={(e) => setF({ ...f, remoteDaysPerWeek: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manager approval for late / remote check-ins">
            <Select
              value={f.approvalMode}
              onChange={(e) => setF({ ...f, approvalMode: e.target.value as typeof f.approvalMode })}
            >
              {Object.entries(APPROVAL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Auto-checkout at"
            hint="Open sessions are closed at office end and flagged as missing checkout. Leave empty to disable."
          >
            <Input
              type="time"
              value={f.autoCheckoutAt ?? ""}
              onChange={(e) => setF({ ...f, autoCheckoutAt: e.target.value || null })}
            />
          </Field>
        </div>
        <section className="border-border grid gap-4 rounded-2xl border p-4">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block font-medium">Verify office check-ins</span>
              <span className="text-muted text-sm">
                Office check-ins must come from an office IP or within a radius of the office. Off by default.
              </span>
            </span>
            <Switch
              checked={f.geo.enabled}
              onCheckedChange={(v) => setF({ ...f, geo: { ...f.geo, enabled: v } })}
              aria-label="Verify office check-ins"
              disabled={ro}
            />
          </label>
          {f.geo.enabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Office latitude">
                <Input
                  type="number"
                  step="any"
                  value={f.geo.lat ?? ""}
                  onChange={(e) =>
                    setF({
                      ...f,
                      geo: { ...f.geo, lat: e.target.value === "" ? null : Number(e.target.value) },
                    })
                  }
                />
              </Field>
              <Field label="Office longitude">
                <Input
                  type="number"
                  step="any"
                  value={f.geo.lng ?? ""}
                  onChange={(e) =>
                    setF({
                      ...f,
                      geo: { ...f.geo, lng: e.target.value === "" ? null : Number(e.target.value) },
                    })
                  }
                />
              </Field>
              <Field label="Radius (metres)">
                <Input
                  type="number"
                  min={25}
                  max={5000}
                  value={f.geo.radiusM}
                  onChange={(e) => setF({ ...f, geo: { ...f.geo, radiusM: Number(e.target.value) } })}
                />
              </Field>
              <Field label="Office IP addresses" hint="One per line." className="sm:col-span-3">
                <Textarea
                  rows={2}
                  value={ips}
                  onChange={(e) => setIps(e.target.value)}
                  placeholder="203.0.113.10"
                />
              </Field>
            </div>
          )}
        </section>
        <SaveBar busy={busy === "policy"} disabled={ro} />
      </fieldset>
    </form>
  );
}

function ScheduleTab({ d, ro }: { d: SettingsData; ro: boolean }) {
  const { busy, run } = useSave();
  const tzs = useMemo(
    () => (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone"),
    [],
  );
  const [w, setW] = useState(d.workspace);
  const [weekend, setWeekend] = useState(d.settings.weekendDays);
  const [brk, setBrk] = useState<{
    id?: string;
    name: string;
    startTime: string;
    endTime: string;
    paid: boolean;
  } | null>(null);
  return (
    <div className="grid gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("schedule", () => actions.settings.schedule({ ...w, weekendDays: weekend }));
        }}
      >
        <fieldset disabled={ro} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Workspace name">
              <Input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
            </Field>
            <Field label="Timezone">
              <Select value={w.timezone} onChange={(e) => setW({ ...w, timezone: e.target.value })}>
                {tzs.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Country (ISO code)" hint="Used for public holidays.">
              <Input
                value={w.country}
                maxLength={2}
                onChange={(e) => setW({ ...w, country: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Locale" hint="Date and number formatting.">
              <Input
                value={w.locale}
                onChange={(e) => setW({ ...w, locale: e.target.value })}
                placeholder="en-US"
              />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Weekend days</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((name, i) => {
                const on = weekend.includes(i);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    disabled={ro}
                    onClick={() => setWeekend(on ? weekend.filter((x) => x !== i) : [...weekend, i].sort())}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-sm transition-colors disabled:opacity-60",
                      on ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-2",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <SaveBar busy={busy === "schedule"} disabled={ro} />
        </fieldset>
      </form>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Break windows</h3>
            <p className="text-muted text-sm">
              Unpaid breaks are subtracted from expected hours; employees can tag breaks they take with these.
            </p>
          </div>
          {!ro && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBrk({ name: "", startTime: "13:00", endTime: "14:00", paid: false })}
            >
              <Plus aria-hidden /> Add break
            </Button>
          )}
        </div>
        <ul className="grid gap-2">
          {d.breaks.length === 0 && <li className="text-muted text-sm">No breaks configured.</li>}
          {d.breaks.map((b) => (
            <li
              key={b.id}
              className="border-border flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
            >
              <Timer className="text-muted size-4" aria-hidden />
              <span className="flex-1 text-sm font-medium">{b.name}</span>
              <span className="tabular text-muted text-sm">
                {b.startTime}–{b.endTime}
              </span>
              <Badge tone={b.paid ? "success" : "neutral"}>{b.paid ? "Paid" : "Unpaid"}</Badge>
              {!ro && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setBrk(b)}>
                    Edit
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${b.name}`}
                    onClick={() =>
                      run("delbreak", () => actions.settings.deleteBreak({ id: b.id }), "Break removed")
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      <Dialog open={!!brk} onOpenChange={(o) => !o && setBrk(null)}>
        <DialogContent title={brk?.id ? "Edit break" : "Add break"}>
          {brk && (
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run("break", () => actions.settings.saveBreak(brk), "Break saved")) setBrk(null);
              }}
            >
              <Field label="Name">
                <Input
                  value={brk.name}
                  onChange={(e) => setBrk({ ...brk, name: e.target.value })}
                  placeholder="Lunch"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start">
                  <Input
                    type="time"
                    value={brk.startTime}
                    onChange={(e) => setBrk({ ...brk, startTime: e.target.value })}
                  />
                </Field>
                <Field label="End">
                  <Input
                    type="time"
                    value={brk.endTime}
                    onChange={(e) => setBrk({ ...brk, endTime: e.target.value })}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={brk.paid}
                  onCheckedChange={(v) => setBrk({ ...brk, paid: v })}
                  aria-label="Paid break"
                />{" "}
                Paid break
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setBrk(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy === "break"}>
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type LT = SettingsData["leaveTypes"][number];
function LeaveTab({ d, ro }: { d: SettingsData; ro: boolean }) {
  const { busy, run } = useSave();
  const [edit, setEdit] = useState<Partial<LT> | null>(null);
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-sm">
          Yearly quotas per member. Monthly accrual earns 1/12 of the quota each month (rounded to half days).
        </p>
        {!ro && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setEdit({
                code: "",
                name: "",
                yearlyQuota: 10,
                accrual: "yearly",
                paid: true,
                active: true,
                color: "info",
              })
            }
          >
            <Plus aria-hidden /> Add leave type
          </Button>
        )}
      </div>
      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-start">Type</th>
              <th className="px-4 py-2 text-end">Quota / year</th>
              <th className="px-4 py-2 text-start">Accrual</th>
              <th className="px-4 py-2 text-start">Pay</th>
              <th className="px-4 py-2 text-start">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {d.leaveTypes.map((t) => (
              <tr key={t.id} className="border-border border-t">
                <td className="px-4 py-2">
                  <span className="font-medium">{t.name}</span>{" "}
                  <span className="text-muted font-mono text-xs">{t.code}</span>
                </td>
                <td className="tabular px-4 py-2 text-end">{t.yearlyQuota}</td>
                <td className="px-4 py-2 capitalize">{t.accrual}</td>
                <td className="px-4 py-2">{t.paid ? "Paid" : "Unpaid"}</td>
                <td className="px-4 py-2">
                  <Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-2 text-end">
                  {!ro && (
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(t)}>
                        Edit
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${t.name}`}
                        onClick={() =>
                          confirm(
                            t.used
                              ? `"${t.name}" has history, so it will be deactivated instead of deleted.`
                              : `Delete "${t.name}"?`,
                          ) &&
                          run(
                            "del",
                            () => actions.settings.deleteLeaveType({ id: t.id }),
                            t.used ? "Deactivated" : "Deleted",
                          )
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Edit leave type" : "Add leave type"}>
          {edit && (
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(
                  "lt",
                  () =>
                    actions.settings.saveLeaveType({
                      id: edit.id,
                      code: edit.code ?? "",
                      name: edit.name ?? "",
                      yearlyQuota: Number(edit.yearlyQuota ?? 0),
                      accrual: edit.accrual ?? "yearly",
                      paid: edit.paid ?? true,
                      active: edit.active ?? true,
                      color: (edit.color as "info") ?? "info",
                    }),
                  "Leave type saved",
                );
                if (ok) setEdit(null);
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input
                    value={edit.name ?? ""}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </Field>
                <Field label="Code" hint="e.g. casual">
                  <Input
                    value={edit.code ?? ""}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </Field>
                <Field label="Days per year">
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    value={edit.yearlyQuota ?? 0}
                    onChange={(e) => setEdit({ ...edit, yearlyQuota: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Accrual">
                  <Select
                    value={edit.accrual}
                    onChange={(e) => setEdit({ ...edit, accrual: e.target.value as "yearly" })}
                  >
                    <option value="yearly">Full quota on Jan 1</option>
                    <option value="monthly">Monthly</option>
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={edit.paid ?? true}
                    onCheckedChange={(v) => setEdit({ ...edit, paid: v })}
                    aria-label="Paid"
                  />{" "}
                  Paid
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={edit.active ?? true}
                    onCheckedChange={(v) => setEdit({ ...edit, active: v })}
                    aria-label="Active"
                  />{" "}
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy === "lt"}>
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScoringTab({ d, ro }: { d: SettingsData; ro: boolean }) {
  const { busy, run } = useSave();
  const [s, setS] = useState(d.settings.scoring);
  const fields = [
    ["late", "Late arrival"],
    ["absent", "Absence without leave"],
    ["missingCheckout", "Missing checkout"],
    ["halfDay", "Half-day"],
  ] as const;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run("scoring", () => actions.settings.scoring(s));
      }}
    >
      <fieldset disabled={ro} className="grid gap-5">
        <p className="text-muted text-sm">
          Attendance index = 100 − penalty points for the period (never below 0). Example with these values: 2
          lates and 1 absence = {100 - (2 * s.late + s.absent)}%.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(([k, label]) => (
            <Field key={k} label={`${label} (points)`}>
              <Input
                type="number"
                step="0.5"
                min={0}
                max={50}
                value={s[k]}
                onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        <SaveBar busy={busy === "scoring"} disabled={ro} />
      </fieldset>
    </form>
  );
}

function MembersTab({ d }: { d: SettingsData }) {
  const { busy, run } = useSave();
  const [transfer, setTransfer] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  return (
    <div className="grid gap-6">
      <ul className="grid gap-2">
        {d.members.map((m) => (
          <li
            key={m.id}
            className="border-border flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
          >
            <Avatar name={m.name} image={m.image} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{m.name}</span>
              <span className="text-muted text-xs">
                {m.code} · {m.email}
              </span>
            </span>
            {m.role === "owner" ? (
              <Badge tone="primary">
                <Crown aria-hidden /> Owner
              </Badge>
            ) : (
              <Select
                className="h-8 w-36"
                value={m.role}
                disabled={busy === m.id}
                aria-label={`Role for ${m.name}`}
                onChange={(e) =>
                  run(
                    m.id,
                    () =>
                      actions.settings.setRole({
                        membershipId: m.id,
                        role: e.target.value as "manager" | "employee",
                      }),
                    "Role updated",
                  )
                }
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
              </Select>
            )}
          </li>
        ))}
      </ul>
      <section className="bg-warning-soft grid gap-3 rounded-2xl border border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <Crown className="size-4" aria-hidden /> Transfer ownership
        </h3>
        <p className="text-muted text-sm">
          The new owner gets full control; you become a manager. This can only be undone by the new owner.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="New owner">
            <Select value={transfer} onChange={(e) => setTransfer(e.target.value)} className="w-56">
              <option value="">Choose a member…</option>
              {d.members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label='Type "TRANSFER" to confirm'>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-40" />
          </Field>
          <Button
            variant="danger"
            disabled={!transfer || confirmText !== "TRANSFER"}
            loading={busy === "transfer"}
            onClick={async () => {
              if (
                await run(
                  "transfer",
                  () => actions.employees.transferOwnership({ id: transfer, confirm: "TRANSFER" }),
                  "Ownership transferred",
                )
              )
                window.location.href = "/app";
            }}
          >
            Transfer
          </Button>
        </div>
      </section>
    </div>
  );
}

function NotificationsTab({ d, ro }: { d: SettingsData; ro: boolean }) {
  const { busy, run } = useSave();
  const [digest, setDigest] = useState(d.settings.digest);
  const [policy, setPolicy] = useState(d.settings.complaintPolicy);
  const [cats, setCats] = useState(d.settings.complaintPolicy.categories.join(", "));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run("notif", () =>
          actions.settings.notifications({
            digest,
            complaintPolicy: {
              ...policy,
              categories: cats
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean),
            },
          }),
        );
      }}
    >
      <fieldset disabled={ro} className="grid gap-5">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-medium">Daily email digest</span>
            <span className="text-muted text-sm">
              Morning summary of inbox items and due tasks. Members can opt out in their profile.
            </span>
          </span>
          <Switch
            checked={digest.dailyDigest}
            onCheckedChange={(v) => setDigest({ ...digest, dailyDigest: v })}
            aria-label="Daily email digest"
            disabled={ro}
          />
        </label>
        <Field label="Digest hour (workspace time)">
          <Input
            type="number"
            min={0}
            max={23}
            value={digest.digestHour}
            onChange={(e) => setDigest({ ...digest, digestHour: Number(e.target.value) })}
            className="w-28"
          />
        </Field>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-medium">Email the locked daily report</span>
            <span className="text-muted text-sm">
              Sent to owners and managers when the report locks at office end.
            </span>
          </span>
          <Switch
            checked={digest.emailLockedReport}
            onCheckedChange={(v) => setDigest({ ...digest, emailLockedReport: v })}
            aria-label="Email locked report"
            disabled={ro}
          />
        </label>
        <hr className="border-border" />
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-medium">Owner can see anonymous submitters</span>
            <span className="text-muted text-sm">Managers never see who submitted an anonymous issue.</span>
          </span>
          <Switch
            checked={policy.anonymousVisibleToOwner}
            onCheckedChange={(v) => setPolicy({ ...policy, anonymousVisibleToOwner: v })}
            aria-label="Owner sees anonymous submitters"
            disabled={ro}
          />
        </label>
        <Field label="Issue categories" hint="Comma separated.">
          <Input value={cats} onChange={(e) => setCats(e.target.value)} />
        </Field>
        <SaveBar busy={busy === "notif"} disabled={ro} />
      </fieldset>
    </form>
  );
}

function DangerTab({ name }: { name: string }) {
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4">
      <section className="border-border flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <div>
          <h3 className="font-medium">Export all workspace data</h3>
          <p className="text-muted text-sm">
            A ZIP with one CSV per table (attendance, leave, tasks, audit log, …).
          </p>
        </div>
        <a
          href="/api/export"
          download
          className="border-border hover:bg-surface-2 inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium"
        >
          <Download className="size-4" aria-hidden /> Download ZIP
        </a>
      </section>
      <section className="bg-danger-soft grid gap-3 rounded-2xl border border-[color-mix(in_oklch,var(--danger)_40%,var(--border))] p-4">
        <h3 className="text-danger-text flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4" aria-hidden /> Delete workspace
        </h3>
        <p className="text-sm">
          Permanently deletes {name} and all of its data for every member. This cannot be undone. Export your
          data first.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={`Type "${name}" to confirm`}>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} className="w-64" />
          </Field>
          <Button
            variant="danger"
            disabled={confirmName !== name}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const { error } = await actions.settings.deleteWorkspace({ confirmName });
              setBusy(false);
              if (error) return toast.error(error.message);
              await signOut();
            }}
          >
            Delete workspace
          </Button>
        </div>
      </section>
    </div>
  );
}

function SettingsPage({ initial, initialTab }: { initial: SettingsData; initialTab?: string }) {
  const { data: d = initial, refetch } = useServerQuery(
    ["settings"],
    () => actions.settings.page.orThrow(),
    initial,
  );
  const ro = !d.canEdit;
  const [tab, setTab] = useState(initialTab ?? "policy");
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
  }, [tab]);
  const s = d.settings;
  return (
    <div className="grid gap-6">
      {ro && (
        <p
          className="border-border bg-info-soft text-info-text flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm"
          role="status"
        >
          <Eye className="size-4 shrink-0" aria-hidden /> You are viewing settings in read-only mode. Only the
          organization owner can change office settings.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Office window"
          value={`${s.officeStart} – ${s.officeEnd}`}
          icon={Clock}
          tone="primary"
          size="sm"
        />
        <StatTile
          label="Late threshold"
          value={`${s.lateThresholdMin} min`}
          icon={Timer}
          tone="warning"
          size="sm"
        />
        <StatTile
          label="Weekend days"
          value={s.weekendDays.length}
          hint={s.weekendDays.map((x) => WEEKDAYS[x]).join(", ")}
          icon={CalendarRange}
          tone="violet"
          size="sm"
        />
        <StatTile
          label="Approval"
          value={s.approvalMode === "none" ? "Open" : "Required"}
          hint={APPROVAL[s.approvalMode]}
          icon={ShieldCheck}
          tone="success"
          size="sm"
        />
      </div>
      <Card>
        <CardBody>
          <Tabs value={tab} onValueChange={setTab} className="grid gap-6">
            <TabsList>
              <TabsTrigger value="policy">Policy</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="leave">Leave</TabsTrigger>
              <TabsTrigger value="scoring">Scoring</TabsTrigger>
              <TabsTrigger value="org">Departments & designations</TabsTrigger>
              {d.isOwner && <TabsTrigger value="members">Members & roles</TabsTrigger>}
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              {d.isOwner && <TabsTrigger value="danger">Danger zone</TabsTrigger>}
            </TabsList>
            <TabsContent value="policy">
              <PolicyTab d={d} ro={ro} />
            </TabsContent>
            <TabsContent value="schedule">
              <ScheduleTab d={d} ro={ro} />
            </TabsContent>
            <TabsContent value="leave">
              <LeaveTab d={d} ro={ro} />
            </TabsContent>
            <TabsContent value="scoring">
              <ScoringTab d={d} ro={ro} />
            </TabsContent>
            <TabsContent value="org">
              <OrgItemsEditor
                departments={d.departments}
                designations={d.designations}
                usage={d.usage}
                onChanged={() => void refetch()}
                readOnly={ro}
              />
            </TabsContent>
            {d.isOwner && (
              <TabsContent value="members">
                <MembersTab d={d} />
              </TabsContent>
            )}
            <TabsContent value="notifications">
              <NotificationsTab d={d} ro={ro} />
            </TabsContent>
            {d.isOwner && (
              <TabsContent value="danger">
                <DangerTab name={d.workspace.name} />
              </TabsContent>
            )}
          </Tabs>
        </CardBody>
      </Card>
      {d.isOwner && (
        <a
          href="/app/settings/audit"
          className="text-primary inline-flex items-center gap-2 justify-self-start text-sm hover:underline"
        >
          <History className="size-4" aria-hidden /> View the audit log
        </a>
      )}
      {ro && (
        <p className="text-muted flex items-center gap-2 text-xs">
          <Lock className="size-3.5" aria-hidden /> Changes are recorded in the audit log.
        </p>
      )}
    </div>
  );
}

export default withQuery(SettingsPage);
