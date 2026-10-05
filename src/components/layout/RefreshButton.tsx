import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { navigate } from "astro:transitions/client";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/components/features/query";

/** Re-fetches every query on the page; pages without live queries are re-rendered from the server. */
export default function RefreshButton({ label = "Refresh", serverOnly = false }: { label?: string; serverOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        if (serverOnly) await navigate(window.location.pathname + window.location.search, { history: "replace" });
        else await queryClient.invalidateQueries();
        setBusy(false);
      }}
    >
      {!busy && <RefreshCw aria-hidden />}
      {label}
    </Button>
  );
}
