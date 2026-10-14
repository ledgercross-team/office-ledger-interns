import { SetMetadata } from '@nestjs/common';
import type { HrmsRole } from './hrms-auth.types';

export const HRMS_ROLES_KEY = 'hrmsRoles';
export const HRMS_SESSION_KEY = 'hrmsSession';

/** Only these roles, with an organisation chosen. A route without any HRMS decorator is closed. */
export const HrmsRoles = (...roles: HrmsRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(HRMS_ROLES_KEY, roles);

/** Any signed-in session, including a gameMaster and a user who has not chosen an org yet. */
export const HrmsSession = (): MethodDecorator & ClassDecorator =>
  SetMetadata(HRMS_SESSION_KEY, true);
