/**
 * Provides a throwaway Postgres 16 for unit tests.
 * - CI / docker: set TEST_DATABASE_URL to an existing server (database is recreated).
 * - Locally without docker: starts an embedded Postgres on port 54329.
 */
import postgres from "postgres";
import type { TestProject } from "vitest/node";

let stop: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  let adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const pg = new EmbeddedPostgres({
      databaseDir: ".pg-data/test",
      user: "ledger",
      password: "ledger",
      port: 54329,
      persistent: false,
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    stop = () => pg.stop();
    adminUrl = "postgres://ledger:ledger@localhost:54329/postgres";
  }
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists office_ledger_test with (force)");
  await admin.unsafe("create database office_ledger_test");
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = "/office_ledger_test";
  process.env.DATABASE_URL = url.toString();
  const { runMigrations } = await import("../../src/db/migrate-lib");
  await runMigrations(url.toString());
  project.provide("databaseUrl", url.toString());
}

export async function teardown() {
  await stop?.();
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
