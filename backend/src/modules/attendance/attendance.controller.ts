import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AttendanceService } from './attendance.service';
import {
  CorrectAttendanceDto,
  MyAttendanceQueryDto,
  TeamAttendanceQueryDto,
} from './dto/attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Roles('manager', 'employee')
  @Post('check-in')
  checkIn(@CurrentUser() user: AuthUser) {
    return this.service.checkIn(user);
  }

  @Roles('manager', 'employee')
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(@CurrentUser() user: AuthUser) {
    return this.service.checkOut(user);
  }

  @Roles('manager', 'employee')
  @Get('me')
  mine(@CurrentUser() user: AuthUser, @Query() query: MyAttendanceQueryDto) {
    return this.service.mine(user, query);
  }

  @Roles('admin', 'manager')
  @Get()
  team(@CurrentUser() user: AuthUser, @Query() query: TeamAttendanceQueryDto) {
    return this.service.team(user, query);
  }

  @Roles('admin', 'manager')
  @Patch(':recordId')
  correct(
    @CurrentUser() user: AuthUser,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.service.correct(user, recordId, dto);
  }
}
