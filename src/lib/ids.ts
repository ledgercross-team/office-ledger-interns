import { randomBytes, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function inviteCode(prefix = "LEDGER") {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase() || "LEDGER"}-${s}`;
}

export const token = (bytes = 24) => randomBytes(bytes).toString("base64url");

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}
