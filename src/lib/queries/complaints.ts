import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/db";
import { complaintEvents, complaints, files, memberships, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { signedFileUrl } from "@/lib/files";
import { getSettings } from "@/lib/services/attendance";

const submitter = alias(memberships, "sub");
const submitterUser = alias(users, "sub_user");
const assignee = alias(memberships, "asg");
const assigneeUser = alias(users, "asg_user");

/**
 * Processors (owner/manager) see every issue; anonymous submitters are masked unless the viewer is
 * the owner and the workspace allows it. Everyone else sees only their own issues.
 */
export async function complaintsPage(tx: Tx, ctx: WorkspaceContext) {
  const processor = can(ctx, "complaints.process");
  const s = await getSettings(tx, ctx.workspaceId);
  const reveal = can(ctx, "complaints.seeAnonymous") && s.complaintPolicy.anonymousVisibleToOwner;
  const rows = await tx
    .select({
      id: complaints.id,
      subject: complaints.subject,
      category: complaints.category,
      description: complaints.description,
      severity: complaints.severity,
      status: complaints.status,
      anonymous: complaints.anonymous,
      submitterId: complaints.submitterId,
      submitterName: submitterUser.name,
      assigneeId: complaints.assigneeId,
      assigneeName: assigneeUser.name,
      resolutionMessage: complaints.resolutionMessage,
      attachmentFileId: complaints.attachmentFileId,
      createdAt: complaints.createdAt,
      updatedAt: complaints.updatedAt,
    })
    .from(complaints)
    .leftJoin(submitter, eq(submitter.id, complaints.submitterId))
    .leftJoin(submitterUser, eq(submitterUser.id, submitter.userId))
    .leftJoin(assignee, eq(assignee.id, complaints.assigneeId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, assignee.userId))
    .where(processor ? undefined : eq(complaints.submitterId, ctx.membershipId))
    .orderBy(desc(complaints.createdAt))
    .limit(500);
  const ids = rows.map((r) => r.id);
  const events = ids.length
    ? await tx
        .select({
          id: complaintEvents.id,
          complaintId: complaintEvents.complaintId,
          kind: complaintEvents.kind,
          fromStatus: complaintEvents.fromStatus,
          toStatus: complaintEvents.toStatus,
          body: complaintEvents.body,
          internal: complaintEvents.internal,
          createdAt: complaintEvents.createdAt,
          actorId: complaintEvents.actorId,
          actorName: users.name,
        })
        .from(complaintEvents)
        .leftJoin(memberships, eq(memberships.id, complaintEvents.actorId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(inArray(complaintEvents.complaintId, ids))
        .orderBy(asc(complaintEvents.createdAt))
    : [];
  const attachments = ids.length
    ? await tx
        .select({ id: files.id, entityId: files.entityId, filename: files.filename })
        .from(files)
        .where(inArray(files.entityId, ids))
    : [];
  const processors = processor
    ? await tx
        .select({ id: memberships.id, name: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inArray(memberships.role, ["owner", "manager"]))
    : [];
  return {
    processor,
    me: ctx.membershipId,
    canSubmit: can(ctx, "complaints.submit"),
    categories: s.complaintPolicy.categories,
    processors,
    items: rows.map((r) => {
      const own = r.submitterId === ctx.membershipId;
      const masked = r.anonymous && !own && !reveal;
      return {
        ...r,
        submitterId: masked ? null : r.submitterId,
        submitterName: masked
          ? "Anonymous"
          : r.anonymous && !own
            ? `${r.submitterName} (anonymous)`
            : r.submitterName,
        events: events
          .filter((e) => e.complaintId === r.id && (processor || !e.internal))
          .map((e) => ({
            ...e,
            actorName: masked && e.actorId === r.submitterId ? "Anonymous" : e.actorName,
            actorId: undefined,
          })),
        attachments: attachments
          .filter((a) => a.entityId === r.id)
          .map((a) => ({ id: a.id, filename: a.filename, url: signedFileUrl(a.id, 600) })),
      };
    }),
  };
}
export type ComplaintsData = Awaited<ReturnType<typeof complaintsPage>>;
