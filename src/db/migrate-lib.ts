import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const MIGRATIONS = resolve("src/db/migrations");
const SQL_DIR = resolve("src/db/sql");

/**
 * 1. Applies drizzle-kit migrations (tables, enums, indexes).
 * 2. Re-applies every file in src/db/sql in name order. Those files are idempotent
 *    (`create or replace`, `drop ... if exists`) and hold the SQL resolvers, views, roles and RLS.
 */
export async function runMigrations(url: string, log = false) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (existsSync(join(MIGRATIONS, "meta"))) {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    }
    if (existsSync(SQL_DIR)) {
      for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort()) {
        if (log) console.log(`  applying ${file}`);
        await client.unsafe(readFileSync(join(SQL_DIR, file), "utf8"));
      }
    }
  } finally {
    await client.end();
  }
}
