import { hash, verify } from "@node-rs/argon2";

// Argon2id (OWASP 2024 baseline: m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 as const };

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword({ hash: h, password }: { hash: string; password: string }) {
  try {
    return await verify(h, password);
  } catch {
    return false;
  }
}
