import { Body, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { SubmitRatingsDto } from './dto/ratings.dto';
import { RatingsService } from './ratings.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const uuid = new ParseUUIDPipe();
const PERFORMANCE_ROLES = ['ceo', 'coo', 'manager', 'employee'] as const;

// Nothing here returns who rated whom: the app role cannot read project_ratings.
@HrmsController('')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @HrmsRoles('manager', 'employee')
  @Get('me/ratings-due')
  due(@Req() req: HrmsAuthedRequest) {
    return this.ratings.due(principalOf(req));
  }

  @HrmsRoles('manager', 'employee')
  @Post('projects/:id/ratings')
  submit(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: SubmitRatingsDto,
  ) {
    return this.ratings.submit(principalOf(req), id, dto);
  }

  @HrmsRoles(...PERFORMANCE_ROLES)
  @Get('performance')
  list(@Req() req: HrmsAuthedRequest) {
    return this.ratings.list(principalOf(req));
  }

  @HrmsRoles(...PERFORMANCE_ROLES)
  @Get('performance/:memberId')
  breakdown(@Req() req: HrmsAuthedRequest, @Param('memberId', uuid) memberId: string) {
    return this.ratings.breakdown(principalOf(req), memberId);
  }
}
