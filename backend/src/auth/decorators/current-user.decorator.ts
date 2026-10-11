import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined => {
    const request = context.switchToHttp().getRequest();
    return request.user as AuthUser | undefined;
  },
);
