import { useMemo, useState } from "react";
import { actions } from "astro:actions";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STEPS = ["Workspace", "Office hours", "Teams"] as const;

function countries() {
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  const out: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const name = dn.of(code);
        if (name && name !== code && !/^[A-Z]{2}$/.test(name)) out.push({ code, name });
      } catch {
        /* invalid code */
      }
    }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

export default function SetupWizard({ initialName = "" }: { initialName?: string }) {
  const tzs = useMemo(() => (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone"), []);
  const regions = useMemo(countries, []);
  const guessTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const guessCountry = (navigator.language.split("-")[1] ?? "US").toUpperCase();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: initialName,
    timezone: guessTz,
    country: guessCountry,
    officeStart: "09:00",
    officeEnd: "17:00",
    lateThresholdMin: 15,
    weekendDays: [0, 6],
    departments: "Engineering\nDesign\nOperations",
    designations: "Software Engineer\nProduct Designer\nOperations Executive\nTeam Lead",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

  async function submit() {
    setLoading(true);
    setError(null);
    const { error: err } = await actions.workspace.setup({
      ...form,
      departments: lines(form.departments),
      designations: lines(form.designations),
    });
    setLoading(false);
    if (err) return setError(err.message);
    window.location.href = "/app";
  }

  const canNext = step === 0 ? form.name.trim().length >= 2 : step === 1 ? form.officeEnd > form.officeStart : true;

  return (
    <div className="grid gap-6">
      <ol className="flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                i < step ? "bg-success text-white" : i === step ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted",
              )}
            >
              {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-sm", i === step ? "font-medium" : "text-muted")}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className="grid gap-4">
          <Field label="Workspace name" required>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ledgercross" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" hint="All dates and the daily report lock use this timezone.">
              <Select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {tzs.map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
            <Field label="Country" hint="Used for public holiday import.">
              <Select value={form.country} onChange={(e) => set("country", e.target.value)}>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Office start">
              <Input type="time" value={form.officeStart} onChange={(e) => set("officeStart", e.target.value)} />
            </Field>
            <Field label="Office end">
              <Input type="time" value={form.officeEnd} onChange={(e) => set("officeEnd", e.target.value)} />
            </Field>
            <Field label="Late after (min)">
              <Input type="number" min={0} max={240} value={form.lateThresholdMin} onChange={(e) => set("lateThresholdMin", Number(e.target.value))} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Weekend days</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => {
                const on = form.weekendDays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("weekendDays", on ? form.weekendDays.filter((x) => x !== i) : [...form.weekendDays, i].sort())}
                    className={cn("h-9 rounded-lg border px-3 text-sm transition-colors", on ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-2")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Departments" hint="One per line. You can change these later.">
            <Textarea rows={6} value={form.departments} onChange={(e) => set("departments", e.target.value)} />
          </Field>
          <Field label="Designations" hint="One per line.">
            <Textarea rows={6} value={form.designations} onChange={(e) => set("designations", e.target.value)} />
          </Field>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ArrowLeft aria-hidden /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Continue <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button onClick={submit} loading={loading}>
            Create workspace
          </Button>
        )}
      </div>
    </div>
  );
}
