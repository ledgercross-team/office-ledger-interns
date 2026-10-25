import { ForbiddenException, Req, Sse } from '@nestjs/common';
import { HrmsRoles } from './auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from './auth/hrms-auth.guard';
import type { HrmsPrincipal } from './auth/hrms-auth.types';
import { HrmsController } from './hrms-controller.decorator';
import { HrmsRealtimeService } from './realtime.service';

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;

@HrmsController('events')
export class HrmsRealtimeController {
  constructor(private readonly realtime: HrmsRealtimeService) {}

  @HrmsRoles(...ALL, 'gameMaster')
  @Sse()
  stream(@Req() req: HrmsAuthedRequest): ReturnType<HrmsRealtimeService['events']> {
    const principal = req.hrmsAuth as HrmsPrincipal | undefined;
    const scope = principal?.orgId ?? (principal?.role === 'gameMaster' ? 'platform' : null);
    if (!scope) throw new ForbiddenException();
    return this.realtime.events(scope);
  }
}
