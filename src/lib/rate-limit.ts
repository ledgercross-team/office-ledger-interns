import { env } from "./env";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface Store {
  hit(key: string, windowSec: number): Promise<number>;
}

/** Fixed-window counter kept in process memory (dev / single instance). */
class MemoryStore implements Store {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  async hit(key: string, windowSec: number) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      if (this.buckets.size > 10_000) {
        for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
      }
      return 1;
    }
    b.count += 1;
    return b.count;
  }
}

/** Upstash Redis REST (multi-instance production). */
class UpstashStore implements Store {
  async hit(key: string, windowSec: number) {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["EXPIRE", `rl:${key}`, String(windowSec), "NX"],
      ]),
    });
    const data = (await res.json()) as { result: number }[];
    return Number(data[0]?.result ?? 0);
  }
}

const store: Store =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? new UpstashStore() : new MemoryStore();

const authLimit = Number(process.env.RATE_LIMIT_AUTH_PER_MIN ?? 10);

export const LIMITS = {
  auth: { limit: authLimit, windowSec: 60 },
  join: { limit: 5, windowSec: 300 },
  checkin: { limit: 10, windowSec: 60 },
  upload: { limit: 20, windowSec: 60 },
} as const;

export async function rateLimit(bucket: keyof typeof LIMITS, id: string): Promise<RateLimitResult> {
  const { limit, windowSec } = LIMITS[bucket];
  try {
    const count = await store.hit(`${bucket}:${id}`, windowSec);
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: windowSec };
  } catch {
    return { ok: true, remaining: limit, retryAfterSec: 0 }; // fail open if the limiter backend is down
  }
}

export function clientIp(request: Request, fallback = "unknown") {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    fallback
  );
}
