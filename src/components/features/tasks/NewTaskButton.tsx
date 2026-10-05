import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Hero CTA; the board island listens for the event and opens its "New task" dialog. */
export default function NewTaskButton() {
  return (
    <Button onClick={() => window.dispatchEvent(new CustomEvent("ledger:new-task"))}>
      <Plus aria-hidden /> New task
    </Button>
  );
}
