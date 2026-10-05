import type { APIRoute } from "astro";
import { bus, ensureListening, type LedgerEvent } from "@/lib/events";

export const prerender = false;

/** Server-Sent Events: notifications for the current member + cache invalidation topics. */
export const GET: APIRoute = async ({ locals, request }) => {
  const ctx = locals.ctx;
  if (!ctx || ctx.status !== "active") return new Response("Unauthorized", { status: 401 });
  await ensureListening();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: LedgerEvent) => {
        if (e.type === "notification") {
          if (e.membershipIds.includes(ctx.membershipId)) send("notification", { title: e.title, body: e.body, link: e.link });
          send("invalidate", { topic: "notifications" });
        } else send("invalidate", { topic: e.topic });
      };
      bus.on(ctx.workspaceId, onEvent);
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);
      cleanup = () => {
        clearInterval(ping);
        bus.off(ctx.workspaceId, onEvent);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      controller.enqueue(enc.encode(`retry: 5000\nevent: ready\ndata: {}\n\n`));
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
};
