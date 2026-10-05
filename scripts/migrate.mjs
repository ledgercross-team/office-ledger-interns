// Production migrator (plain Node, no TypeScript toolchain): drizzle migrations + idempotent SQL files.
// Usage: node scripts/migrate.mjs   (reads DATABASE_URL)
import "dotenv/config";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: resolve("src/db/migrations") });
  const dir = resolve("src/db/sql");
  if (existsSync(dir))
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith(".sql"))
      .sort())
      await client.unsafe(readFileSync(join(dir, f), "utf8"));
  console.log("Migrations complete.");
} finally {
  await client.end();
}
