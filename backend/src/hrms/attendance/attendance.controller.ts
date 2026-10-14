import { Body, Get, Header, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { AttendanceService } from './attendance.service';
import { FileCorrectionDto, MonthQueryDto, TeamAttendanceQueryDto } from './dto/attendance.dto';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;

// There is no edit or delete route: a wrong day is changed through a correction request.
@HrmsController('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @HrmsRoles(...ALL)
  @HttpCode(HttpStatus.OK)
  @Post('check-in')
  checkIn(@Req() req: HrmsAuthedRequest) {
    return this.attendance.checkIn(principalOf(req), req.ip);
  }

  @HrmsRoles(...ALL)
  @HttpCode(HttpStatus.OK)
  @Post('check-out')
  checkOut(@Req() req: HrmsAuthedRequest) {
    return this.attendance.checkOut(principalOf(req));
  }

  @HrmsRoles(...ALL)
  @Get('me')
  me(@Req() req: HrmsAuthedRequest, @Query() q: MonthQueryDto) {
    return this.attendance.me(principalOf(req), q.month);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Get()
  team(@Req() req: HrmsAuthedRequest, @Query() q: TeamAttendanceQueryDto) {
    const p = principalOf(req);
    return q.memberId ? this.attendance.forMember(p, q.memberId, q.month) : this.attendance.teamDay(p, q.date);
  }

  @HrmsRoles(...ALL)
  @Post('corrections')
  correction(@Req() req: HrmsAuthedRequest, @Body() dto: FileCorrectionDto) {
    return this.attendance.fileCorrection(principalOf(req), dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="attendance.csv"')
  @Get('report')
  report(@Req() req: HrmsAuthedRequest, @Query() q: MonthQueryDto) {
    return this.attendance.reportCsv(principalOf(req), q.month);
  }
}
