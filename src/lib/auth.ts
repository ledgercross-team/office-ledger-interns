import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/db";
import { accounts, sessions, twoFactors, users, verificationTokens } from "@/db/schema";
import { env, isProd } from "./env";
import { mailHtml, sendMail } from "./mailer";
import { hashPassword, verifyPassword } from "./password";

export const auth = betterAuth({
  appName: "Office Ledger",
  baseURL: env.BETTER_AUTH_URL ?? env.PUBLIC_SITE_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.PUBLIC_SITE_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users,
      sessions,
      accounts,
      verification_tokens: verificationTokens,
      two_factors: twoFactors,
    },
  }),
  user: {
    modelName: "users",
    additionalFields: {
      theme: { type: "string", required: false, defaultValue: "system", input: false },
      activeWorkspaceId: { type: "string", required: false, input: false },
    },
    changeEmail: { enabled: false },
  },
  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  account: { modelName: "accounts" },
  verification: { modelName: "verification_tokens" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    password: { hash: hashPassword, verify: verifyPassword },
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your Office Ledger password",
        text: `Hi ${user.name},\n\nUse this link within 30 minutes to choose a new password:\n${url}\n\nIf you didn't ask for this, ignore this email.`,
        html: mailHtml("Reset your password", [`Hi ${user.name},`, "Use the button below within 30 minutes to choose a new password. If you didn't ask for this, ignore this email."], { label: "Reset password", url }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your email for Office Ledger",
        text: `Hi ${user.name},\n\nConfirm your email address:\n${url}`,
        html: mailHtml("Verify your email", [`Hi ${user.name},`, "Confirm your email address to finish setting up your account."], { label: "Verify email", url }),
      });
    },
  },
  plugins: [twoFactor({ issuer: "Office Ledger", schema: { twoFactor: { modelName: "two_factors" } } })],
  // Our own limiter (src/lib/rate-limit.ts) wraps the auth route; keep Better Auth's as a backstop.
  rateLimit: { enabled: isProd, window: 60, max: 100 },
  advanced: {
    cookiePrefix: "ledger",
    useSecureCookies: isProd,
    defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure: isProd },
  },
  telemetry: { enabled: false },
});

export type Auth = typeof auth;
