import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { withWorkspace } from "@/db";
import { complaints, files, leaveRequests, memberships, taskAssignees, tasks, users } from "@/db/schema";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { storeFile, signedFileUrl, UploadError } from "@/lib/files";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

export const prerender = false;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

/**
 * Multipart upload. Fields: file, entityType (membership|task|leave_request|complaint|avatar), entityId, kind.
 * Permission depends on the entity: documents on a profile → managers or the member themself; task
 * attachments → anyone who can update the task; leave/complaint attachments → the requester.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const ctx = locals.ctx;
  if (!ctx || ctx.status !== "active") return json({ message: "Unauthorized" }, 401);
  const rl = await rateLimit("upload", ctx.membershipId);
  if (!rl.ok) return json({ message: "Too many uploads. Try again shortly." }, 429);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const entityType = String(form?.get("entityType") ?? "");
  const entityId = String(form?.get("entityId") ?? "") || null;
  const kind = String(form?.get("kind") ?? "attachment").slice(0, 40);
  if (!(file instanceof File)) return json({ message: "No file uploaded." }, 400);

  try {
    return await withWorkspace(ctx.workspaceId, async (tx) => {
      if (entityType === "avatar") {
        const stored = await storeFile(ctx.workspaceId, file, { images: true });
        const [row] = await tx
          .insert(files)
          .values({ workspaceId: ctx.workspaceId, ownerMembershipId: ctx.membershipId, entityType: "avatar", entityId: ctx.membershipId, kind: "avatar", ...stored })
          .returning();
        await db.update(users).set({ image: `/api/avatar/${ctx.userId}?v=${row!.id.slice(0, 8)}` }).where(eq(users.id, ctx.userId));
        return json({ id: row!.id });
      }
      let allowed = false;
      if (entityType === "membership" && entityId) {
        const [m] = await tx.select({ id: memberships.id, role: memberships.role }).from(memberships).where(eq(memberships.id, entityId));
        allowed = !!m && (m.id === ctx.membershipId || can(ctx, "employees.manage", { ownerRole: m.role }));
      } else if (entityType === "task" && entityId) {
        const [t] = await tx.select({ createdBy: tasks.createdBy }).from(tasks).where(eq(tasks.id, entityId));
        const assignees = (await tx.select({ id: taskAssignees.membershipId }).from(taskAssignees).where(eq(taskAssignees.taskId, entityId))).map((a) => a.id);
        allowed = !!t && can(ctx, "tasks.update", { assigneeIds: assignees, createdBy: t.createdBy });
      } else if (entityType === "leave_request" && entityId) {
        const [l] = await tx.select({ m: leaveRequests.membershipId }).from(leaveRequests).where(eq(leaveRequests.id, entityId));
        allowed = l?.m === ctx.membershipId;
      } else if (entityType === "complaint" && entityId) {
        const [c] = await tx.select({ m: complaints.submitterId }).from(complaints).where(eq(complaints.id, entityId));
        allowed = c?.m === ctx.membershipId || can(ctx, "complaints.process");
      }
      if (!allowed) return json({ message: "You can't attach files here." }, 403);
      const stored = await storeFile(ctx.workspaceId, file);
      const [row] = await tx
        .insert(files)
        .values({ workspaceId: ctx.workspaceId, ownerMembershipId: ctx.membershipId, entityType, entityId, kind, ...stored })
        .returning();
      if (entityType === "leave_request") await tx.update(leaveRequests).set({ attachmentFileId: row!.id }).where(and(eq(leaveRequests.id, entityId!)));
      if (entityType === "complaint") await tx.update(complaints).set({ attachmentFileId: row!.id }).where(eq(complaints.id, entityId!));
      if (entityType === "membership") await audit(tx, ctx, "document.uploaded", "membership", entityId, `Uploaded document "${stored.filename}"`);
      return json({ id: row!.id, filename: row!.filename, url: signedFileUrl(row!.id) });
    });
  } catch (e) {
    if (e instanceof UploadError) return json({ message: e.message }, 400);
    throw e;
  }
};
