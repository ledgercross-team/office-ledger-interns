import { SetMetadata } from '@nestjs/common';
import type { Role } from '../auth.types';

export const ROLES_KEY = 'roles';

export const ALL_ROLES: Role[] = ['game_master', 'admin', 'manager', 'employee'];

export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
