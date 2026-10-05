import { env } from "@/lib/env";
import { runMigrations } from "./migrate-lib";

console.log("Running migrations…");
await runMigrations(env.DATABASE_URL, true);
console.log("Migrations complete.");
