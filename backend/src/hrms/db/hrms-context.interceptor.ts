import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { HrmsContextService, type HrmsRequestContext } from './hrms-context';

export interface HrmsRequest extends Request {
  // Set by the auth guard. Absent on public routes.
  hrmsContext?: Pick<HrmsRequestContext, 'orgId' | 'memberId' | 'userId'>;
}

// Wraps a handler in the request transaction. The handler's result is awaited inside it,
// so the commit happens after the handler and a commit error reaches the error filter.
@Injectable()
export class HrmsContextInterceptor implements NestInterceptor {
  constructor(private readonly context: HrmsContextService) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = executionContext.switchToHttp().getRequest<HrmsRequest>();
    const ctx: HrmsRequestContext = { ...req.hrmsContext, ip: req.ip ?? null };

    return from(this.context.run(ctx, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
