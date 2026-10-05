import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "./env";

export const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
export const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];

const root = resolve(env.STORAGE_DIR);

/** Checks the leading bytes match the declared type (prevents e.g. HTML uploaded as image/png). */
export function sniffOk(mime: string, buf: Buffer) {
  const hex = buf.subarray(0, 12).toString("hex");
  switch (mime) {
    case "image/png":
      return hex.startsWith("89504e470d0a1a0a");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/webp":
      return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
    case "application/pdf":
      return buf.subarray(0, 5).toString() === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return hex.startsWith("504b0304");
    case "text/plain":
    case "text/csv":
      return !buf.subarray(0, 512).includes(0) && !/<\s*(script|html|svg)/i.test(buf.subarray(0, 512).toString());
    default:
      return false;
  }
}

export class UploadError extends Error {}

export async function storeFile(workspaceId: string, file: File, opts: { images?: boolean } = {}) {
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > maxBytes) throw new UploadError(`Files must be under ${env.MAX_UPLOAD_MB} MB.`);
  const mime = file.type;
  const allowed = opts.images ? IMAGE_MIME : Object.keys(ALLOWED_MIME);
  if (!allowed.includes(mime)) throw new UploadError(opts.images ? "Use a PNG, JPEG or WebP image." : "That file type isn't allowed.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffOk(mime, buf)) throw new UploadError("The file contents don't match its type.");
  const key = `${workspaceId}/${randomUUID()}.${ALLOWED_MIME[mime]}`;
  const path = join(root, key);
  if (!path.startsWith(root)) throw new UploadError("Invalid path.");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf, { mode: 0o600 });
  return { storageKey: key, mime, size: file.size, filename: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file" };
}

export async function readStored(key: string) {
  const path = join(root, key);
  if (!path.startsWith(root)) throw new Error("Invalid path");
  return readFile(path);
}

export async function deleteStored(key: string) {
  const path = join(root, key);
  if (path.startsWith(root)) await unlink(path).catch(() => {});
}

const sign = (payload: string) => createHmac("sha256", env.FILE_SIGNING_SECRET).update(payload).digest("base64url");

/** Short-lived signed URL (default 5 minutes). */
export function signedFileUrl(fileId: string, ttlSec = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `/api/files/${fileId}?exp=${exp}&sig=${sign(`${fileId}.${exp}`)}`;
}

export function verifyFileSignature(fileId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(`${fileId}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const hmac = sign;
