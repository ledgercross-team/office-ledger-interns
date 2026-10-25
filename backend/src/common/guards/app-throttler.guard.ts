import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'node:crypto';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

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
