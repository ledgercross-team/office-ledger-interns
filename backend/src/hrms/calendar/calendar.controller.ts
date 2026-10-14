import { Body, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { CalendarService } from './calendar.service';
import { CalendarQueryDto, CreateMeetingDto, RespondMeetingDto, UpdateMeetingDto } from './dto/calendar.dto';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;
const uuid = new ParseUUIDPipe();

@HrmsController('')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @HrmsRoles(...ALL)
  @Get('calendar')
  feed(@Req() req: HrmsAuthedRequest, @Query() q: CalendarQueryDto) {
    return this.calendar.calendar(principalOf(req), q);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Post('meetings')
  create(@Req() req: HrmsAuthedRequest, @Body() dto: CreateMeetingDto) {
    return this.calendar.createMeeting(principalOf(req), dto);
  }

  @HrmsRoles(...ALL)
  @Get('meetings/:id')
  get(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.calendar.getMeeting(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Patch('meetings/:id')
  update(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string, @Body() dto: UpdateMeetingDto) {
    return this.calendar.updateMeeting(principalOf(req), id, dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @HttpCode(HttpStatus.OK)
  @Post('meetings/:id/cancel')
  cancel(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.calendar.cancelMeeting(principalOf(req), id);
  }

  @HrmsRoles(...ALL)
  @HttpCode(HttpStatus.OK)
  @Post('meetings/:id/respond')
  respond(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string, @Body() dto: RespondMeetingDto) {
    return this.calendar.respond(principalOf(req), id, dto.response);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Get('workload')
  workload(@Req() req: HrmsAuthedRequest) {
    return this.calendar.workload(principalOf(req));
  }
}
