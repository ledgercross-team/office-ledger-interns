import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, Role } from '../auth.types';
import { isHrmsPath } from '../../hrms/hrms-paths';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Deny by default: a non-public route without @Roles is closed to everyone.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isHrmsPath(context.switchToHttp().getRequest<{ path?: string }>().path)) return true;

    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;

    if (!roles || roles.length === 0 || !user || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    return true;
  }
}
