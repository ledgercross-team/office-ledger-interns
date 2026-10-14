import { type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { RedisService } from '../../modules/redis/redis.service';

// Hammering the login (counted even when the normal limit already answers 429): more than
// 70 attempts from one IP + email in 10 minutes blocks that pair for 12 hours.
export const LOGIN_ABUSE_ATTEMPTS = 70;
export const LOGIN_ABUSE_WINDOW_SECONDS = 10 * 60;
export const LOGIN_ABUSE_BLOCK_SECONDS = 12 * 60 * 60;

interface Counter {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  exists(key: string): Promise<number>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

/** Counts one login attempt. Returns the seconds the pair is blocked for, or 0 when it may go on. */
export async function registerLoginAttempt(redis: Counter, tracker: string): Promise<number> {
  const id = createHash('sha256').update(tracker).digest('hex').slice(0, 32);
  const blockKey = `login-block:${id}`;
  if ((await redis.exists(blockKey)) > 0) return Math.max(await redis.ttl(blockKey), 1);

  const countKey = `login-attempts:${id}`;
  const count = await redis.incr(countKey);
  if (count === 1) await redis.expire(countKey, LOGIN_ABUSE_WINDOW_SECONDS);
  if (count > LOGIN_ABUSE_ATTEMPTS) {
    await redis.set(blockKey, '1', 'EX', LOGIN_ABUSE_BLOCK_SECONDS);
    return LOGIN_ABUSE_BLOCK_SECONDS;
  }
  return 0;
}

// Per-route limits (section 10), applied with @Throttle on the handlers:
//   global, every route       100 / 60 s   by IP
//   POST /auth/login           10 / 2 min  by IP + email
//   POST /auth/refresh         30 / 15 min by IP
//   POST /auth/change-password  5 / 15 min by IP
//   POST /users, resets        30 / 60 min by IP
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly redis: RedisService,
  ) {
    super(options, storageService, reflector);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Record<string, any>>();
    if (req.method === 'POST' && req.path === '/api/auth/login') {
      const blockedFor = await registerLoginAttempt(this.redis.client, await this.getTracker(req));
      if (blockedFor > 0) {
        const hours = Math.ceil(blockedFor / 3600);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'LOGIN_BLOCKED',
            message: `Too many sign-in attempts from this address for this email. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return super.canActivate(context);
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
