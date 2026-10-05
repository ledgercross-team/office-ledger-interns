import { actions } from "astro:actions";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

interface Props {
  current: { id: string; name: string };
  workspaces: { workspaceId: string; workspaceName: string; role: string; status: string }[];
}

export default function WorkspaceSwitcher({ current, workspaces }: Props) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-start text-sm text-muted hover:bg-surface-2 hover:text-text"
          aria-label={`Workspace: ${current.name}. Switch workspace`}
        >
          <span className="truncate" data-collapse-hide>{current.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces
          .filter((w) => w.status === "active")
          .map((w) => (
            <MenuItem
              key={w.workspaceId}
              onSelect={async () => {
                if (w.workspaceId === current.id) return;
                await actions.workspace.switch({ workspaceId: w.workspaceId });
                window.location.href = "/app";
              }}
            >
              <span className="flex-1 truncate">{w.workspaceName}</span>
              <span className="text-xs capitalize text-muted">{w.role}</span>
              {w.workspaceId === current.id && <Check aria-hidden />}
            </MenuItem>
          ))}
        <MenuSeparator />
        <MenuItem onSelect={() => (window.location.href = "/auth/join")}>
          <Plus aria-hidden /> Join or create workspace
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
