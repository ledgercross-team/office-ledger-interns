import postgres from "postgres";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Schema = typeof schema;
export type DB = PostgresJsDatabase<Schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const g = globalThis as unknown as { __ledgerSql?: postgres.Sql };

export const client = g.__ledgerSql ?? postgres(env.DATABASE_URL, { max: 10, onnotice: () => {} });
// Only the pool survives dev hot reloads; the Drizzle instance is rebuilt so schema edits apply.
if (env.NODE_ENV !== "production") g.__ledgerSql = client;
/** Unscoped connection (owner role). Use only for auth, membership resolution, jobs and seeding. */
export const db: DB = drizzle(client, { schema, casing: "snake_case" });

/**
 * Runs `fn` in a transaction restricted to one workspace by Postgres RLS (role `ledger_app` +
 * `app.workspace_id`). Every request-path query should go through this.
 */
export async function withWorkspace<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    await tx.execute(sql`set local role ledger_app`);
    return fn(tx);
  });
}

export { schema, sql };
