import { execSync } from "node:child_process";

/** Fresh, deterministic demo data before every run. */
export default function globalSetup() {
  execSync("pnpm db:migrate && pnpm db:seed", { stdio: "inherit" });
}
