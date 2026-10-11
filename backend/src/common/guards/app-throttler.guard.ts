import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Per-route limits (section 10), applied with @Throttle on the handlers:
//   global, every route       100 / 60 s   by IP
//   POST /auth/login            5 / 15 min by IP + email
//   POST /auth/refresh         30 / 15 min by IP
//   POST /auth/change-password  5 / 15 min by IP
//   POST /users, resets        30 / 60 min by IP
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // Login attempts are counted per IP + email; everything else per IP.
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const isLogin = req.method === 'POST' && req.path === '/api/v1/auth/login';
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const ip = String(req.ip ?? '');

    return Promise.resolve(isLogin ? `${ip}:${email}` : ip);
  }
}
