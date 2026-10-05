import type { APIRoute } from "astro";
import { z } from "zod";
import { mailHtml, sendMail } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const prerender = false;

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  size: z.string().max(20).optional(),
  message: z.string().trim().min(10).max(4000),
  website: z.string().max(0).optional(), // honeypot
});

export const POST: APIRoute = async ({ request, redirect, site }) => {
  const rl = await rateLimit("join", `contact:${clientIp(request)}`);
  if (!rl.ok) return new Response("Too many messages. Please try again later.", { status: 429 });
  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success)
    return new Response("Please fill in your name, a valid email and a message of at least 10 characters.", {
      status: 400,
    });
  const { name, email, size, message } = parsed.data;
  await sendMail({
    to: `hello@${new URL(site!).host}`,
    subject: `Contact form: ${name} (${size ?? "?"})`,
    text: `From: ${name} <${email}>\nCompany size: ${size ?? "-"}\n\n${message}`,
    html: mailHtml(`Message from ${name}`, [
      `From: ${name} <${email}>`,
      `Company size: ${size ?? "-"}`,
      message,
    ]),
  });
  return redirect("/contact/thanks", 303);
};
