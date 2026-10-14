import {
  applyDecorators,
  Controller,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { HrmsAuthGuard } from './auth/hrms-auth.guard';
import { HrmsContextInterceptor } from './db/hrms-context.interceptor';
import { HrmsErrorFilter } from './hrms-error.filter';

/**
 * Every controller uses this: path under /api, the auth guard (deny by default; opt out
 * with @Public()), the request transaction and DB error mapping.
 */
export function HrmsController(path: string): ClassDecorator {
  return applyDecorators(
    Controller(`api/${path}`.replace(/\/$/, '')),
    UseGuards(HrmsAuthGuard),
    UseInterceptors(HrmsContextInterceptor),
    UseFilters(HrmsErrorFilter),
  );
}
