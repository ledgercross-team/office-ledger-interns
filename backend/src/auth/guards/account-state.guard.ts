import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import type { AuthUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const API_PREFIX = '/api/v1';

const PASSWORD_PENDING_ALLOWED = ['/auth/me', '/auth/change-password', '/auth/logout'];

function routePath(req: Request): string {
  const path = req.path.startsWith(API_PREFIX) ? req.path.slice(API_PREFIX.length) : req.path;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

// Keeps a user with a pending password change, or whose company has no active
// subscription, inside the routes they may still use (section 9.3).
@Injectable()
export class AccountStateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;

    if (!user) {
      return true; // JwtAuthGuard has already rejected unauthenticated requests.
    }

    const path = routePath(req);

    if (user.mustChangePassword && !PASSWORD_PENDING_ALLOWED.includes(path)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing.',
      });
    }

    if (user.companyId && user.role !== 'game_master') {
      const allowed =
        isUnder(path, '/auth') ||
        isUnder(path, '/company/subscription') ||
        (user.role === 'admin' && isUnder(path, '/message-threads'));

      if (!allowed && !(await this.authService.getSubscriptionActive(user.companyId))) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'SUBSCRIPTION_INACTIVE',
          message: "Your company's subscription has ended. Please contact your admin.",
        });
      }
    }

    return true;
  }
}
