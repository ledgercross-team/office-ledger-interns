import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

// Per-route limits (section 10), applied with @Throttle on the handlers:
//   global, every route       100 / 60 s   by IP
//   POST /auth/login           10 / 2 min  by IP + email
//   POST /auth/refresh         30 / 15 min by IP
//   POST /auth/change-password  5 / 15 min by IP
//   POST /users, resets        30 / 60 min by IP
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // Login attempts are counted per IP + email; everything else per IP.
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const isLogin = req.method === 'POST' && req.path === '/api/auth/login';
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const ip = String(req.ip ?? '');

    // One-time code attempts are counted per sign-in (the pending token), not only per IP, so
    // spreading guesses over many addresses does not multiply the allowance.
    const isMfa = req.method === 'POST' && String(req.path).startsWith('/api/auth/mfa/');
    const mfaToken = (req.body as { mfaToken?: unknown } | undefined)?.mfaToken;
    if (isMfa && typeof mfaToken === 'string') {
      return Promise.resolve(
        `mfa:${createHash('sha256').update(mfaToken).digest('hex').slice(0, 24)}`,
      );
    }

    return Promise.resolve(isLogin ? `${ip}:${email}` : ip);
  }
}
