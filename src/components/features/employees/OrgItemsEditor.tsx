import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Kind = "department" | "designation";
interface Props {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  usage: { departmentId: string | null; designationId: string | null; n: number }[];
  onChanged: () => void;
  readOnly?: boolean;
}

/** Inline add / rename / delete for departments and designations (with member counts). */
export default function OrgItemsEditor({ departments, designations, usage, onChanged, readOnly }: Props) {
  const [editing, setEditing] = useState<{ kind: Kind; id?: string; name: string } | null>(null);
  const count = (kind: Kind, id: string) =>
    usage
      .filter((u) => (kind === "department" ? u.departmentId : u.designationId) === id)
      .reduce((a, u) => a + u.n, 0);
  async function save() {
    if (!editing?.name.trim()) return;
    const { error } = await actions.employees.saveOrgItem({
      kind: editing.kind,
      id: editing.id,
      name: editing.name,
    });
    if (error) return toast.error(error.message);
    setEditing(null);
    onChanged();
  }
  async function remove(kind: Kind, id: string, name: string) {
    if (!confirm(`Delete ${kind} "${name}"? Members keep their other details.`)) return;
    const { error } = await actions.employees.deleteOrgItem({ kind, id });
    if (error) return toast.error(error.message);
    onChanged();
  }
  const col = (kind: Kind, items: { id: string; name: string }[]) => (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium capitalize">{kind}s</h3>
        {!readOnly && (
          <Button size="sm" variant="ghost" onClick={() => setEditing({ kind, name: "" })}>
            <Plus aria-hidden /> Add
          </Button>
        )}
      </div>
      <ul className="grid gap-1">
        {editing && editing.kind === kind && !editing.id && (
          <li className="flex gap-2">
            <Input
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && save()}
              aria-label={`New ${kind}`}
            />
            <Button size="icon" onClick={save} aria-label="Save">
              <Check aria-hidden />
            </Button>
          </li>
        )}
        {items.map((it) => (
          <li key={it.id} className="hover:bg-surface-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
            {editing?.id === it.id ? (
              <>
                <Input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  aria-label={`Rename ${it.name}`}
                />
                <Button size="icon" onClick={save} aria-label="Save">
                  <Check aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
                  <X aria-hidden />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{it.name}</span>
                <span className="tabular text-muted text-xs">{count(kind, it.id)}</span>
                {!readOnly && (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing({ kind, id: it.id, name: it.name })}
                      aria-label={`Rename ${it.name}`}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => remove(kind, it.id, it.name)}
                      aria-label={`Delete ${it.name}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {col("department", departments)}
      {col("designation", designations)}
    </div>
  );
}
