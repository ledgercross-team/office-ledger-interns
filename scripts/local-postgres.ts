/**
 * Docker-free Postgres 16 for local development and tests.
 * Starts a real Postgres server (binaries from the `embedded-postgres` package) that matches the
 * docker-compose defaults: postgres://ledger:ledger@localhost:5432/office_ledger
 *
 * Usage: pnpm db:local            (keeps running until Ctrl+C)
 *        PGPORT=54329 pnpm db:local
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const port = Number(process.env.PGPORT ?? 5432);
const dir = resolve(process.env.PGDATA_DIR ?? `.pg-data/${port}`);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "ledger",
  password: "ledger",
  port,
  persistent: true,
  onLog: () => {},
});

const fresh = !existsSync(dir);
if (fresh) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("office_ledger");
} catch {
  /* already exists */
}
console.log(`Postgres ready: postgres://ledger:ledger@localhost:${port}/office_ledger`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
