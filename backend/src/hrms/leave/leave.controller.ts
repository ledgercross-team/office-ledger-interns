import { Body, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { CreateLeaveDto, ListLeaveQueryDto } from './dto/leave.dto';
import { LeaveService } from './leave.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;

// Approving or rejecting leave goes through /requests/:id/approve and /reject.
@HrmsController('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @HrmsRoles(...ALL)
  @Get('balance')
  balance(@Req() req: HrmsAuthedRequest) {
    return this.leave.balance(principalOf(req));
  }

  @HrmsRoles(...ALL)
  @Get()
  list(@Req() req: HrmsAuthedRequest, @Query() q: ListLeaveQueryDto) {
    return this.leave.list(principalOf(req), q);
  }

  @HrmsRoles(...ALL)
  @Post()
  create(@Req() req: HrmsAuthedRequest, @Body() dto: CreateLeaveDto) {
    return this.leave.create(principalOf(req), dto);
  }

  @HrmsRoles(...ALL)
  @HttpCode(HttpStatus.OK)
  @Post(':requestId/cancel')
  cancel(@Req() req: HrmsAuthedRequest, @Param('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.leave.cancel(principalOf(req), requestId);
  }
}
