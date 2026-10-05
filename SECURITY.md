# Security policy

## Reporting a vulnerability

Please email **security@officeledger.example.com** (also listed in `/.well-known/security.txt`) with:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the affected URL, version or commit.

Do not open a public issue for security reports. We acknowledge reports within **2 business days**, give a remediation timeline within **7 days**, and credit reporters who want it once a fix ships. Please give us reasonable time to fix before disclosure and avoid accessing other people's data, degrading service, or social engineering while testing.

## Supported versions

Only the latest release on `main` receives security fixes.

## How the app protects data

- Role checks on the server (`src/lib/permissions.ts`) for every page, action and API route; the UI only mirrors them.
- Postgres row-level security keyed on `app.workspace_id` for every tenant table, applied to the `ledger_app` role used by request transactions.
- Argon2id password hashing, 5-attempt account lockout, per-IP rate limits on auth, join, check-in and upload endpoints, optional TOTP 2FA for owners and managers.
- Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production; Astro's origin check protects every mutation.
- Strict Content-Security-Policy (per-request nonce + `strict-dynamic`), HSTS, `nosniff`, `frame-ancestors 'none'`, COOP and a restrictive Permissions-Policy on every response.
- All input is validated with Zod; SQL is parameterised; user-supplied markdown is sanitised with DOMPurify.
- Uploads are size- and MIME-checked (including magic bytes), stored outside `public/`, and served only through short-lived HMAC-signed URLs.
- Privileged actions are recorded in the audit log, with no passwords, tokens or personal contact details in log entries.
- `pnpm audit` runs in CI and Dependabot keeps dependencies current.
