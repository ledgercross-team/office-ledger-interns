import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const LOGIN_PATH = '/api/v1/auth/login';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // Login is tracked per IP + email so a shared office IP is not locked out;
  // every other route is tracked per IP. See section 10 of the build plan.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const isLogin = req.method === 'POST' && req.path === LOGIN_PATH;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return isLogin ? `${req.ip}:${email}` : (req.ip ?? 'unknown');
  }
}
