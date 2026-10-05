import { Badge, type Tone } from "./badge";
import { en } from "@/i18n/en";

export type AttendanceStatus = "present" | "late" | "remote" | "half_day" | "absent" | "on_leave";
export type ApprovalState = "not_required" | "pending" | "approved" | "rejected";

export const STATUS_TONE: Record<AttendanceStatus, Tone> = {
  present: "success",
  late: "warning",
  remote: "info",
  on_leave: "violet",
  absent: "danger",
  half_day: "teal",
};

/** Attendance status pill with the small "Pending approval" sub-label. */
export function StatusPill({ status, approval }: { status: AttendanceStatus; approval?: ApprovalState | null }) {
  const rejected = approval === "rejected";
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge tone={rejected ? "danger" : STATUS_TONE[status]}>
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        {en.status[status]}
      </Badge>
      {approval === "pending" && <span className="text-[0.7rem] text-muted">{en.status.pendingApproval}</span>}
      {rejected && <span className="text-[0.7rem] text-danger-text">Approval rejected</span>}
    </span>
  );
}

const APPROVAL_TONE: Record<ApprovalState, Tone> = { not_required: "neutral", pending: "warning", approved: "success", rejected: "danger" };
export function ApprovalPill({ approval }: { approval: ApprovalState }) {
  return <Badge tone={APPROVAL_TONE[approval]}>{en.status[approval]}</Badge>;
}

const REQ_TONE: Record<string, Tone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
export function RequestPill({ status }: { status: string }) {
  return <Badge tone={REQ_TONE[status] ?? "neutral"} className="capitalize">{status}</Badge>;
}

const PRIORITY_TONE: Record<string, Tone> = { low: "neutral", medium: "info", high: "warning", urgent: "danger", critical: "danger" };
export function PriorityChip({ priority }: { priority: string }) {
  return <Badge tone={PRIORITY_TONE[priority] ?? "neutral"} className="capitalize">{priority}</Badge>;
}
