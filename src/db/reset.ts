import postgres from "postgres";
import { env } from "@/lib/env";

if (env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await sql.end();
console.log("Database reset.");
