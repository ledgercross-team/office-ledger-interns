import nodemailer from "nodemailer";
import { env } from "./env";

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Minimal branded HTML wrapper around plain text (paragraphs + one optional button). */
export function mailHtml(title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b1f2e">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e3e6ef;border-radius:16px;padding:28px">
<p style="margin:0 0 16px;font-weight:700;color:#4256d6">Office Ledger</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="line-height:1.55;margin:0 0 12px;white-space:pre-wrap">${esc(p)}</p>`).join("")}
${cta ? `<p style="margin:20px 0"><a href="${esc(cta.url)}" style="background:#4256d6;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>` : ""}
</div></body></html>`;
}

export async function sendMail(mail: Mail) {
  if (!transport) {
    // Dev: no SMTP configured → log (subject + recipients + text, which includes any links).
    console.info(`\n📧 [mail] to=${[mail.to].flat().join(", ")} subject="${mail.subject}"\n${mail.text}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...mail });
}
