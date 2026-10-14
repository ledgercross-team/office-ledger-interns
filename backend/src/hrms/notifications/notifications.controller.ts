import { Body, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { ListNotificationsQueryDto, UpdateEmailPrefsDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;

@HrmsController('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @HrmsRoles(...ALL)
  @Get()
  list(@Req() req: HrmsAuthedRequest, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(principalOf(req), q);
  }

  @HrmsRoles(...ALL)
  @Get('email-prefs')
  prefs(@Req() req: HrmsAuthedRequest) {
    return this.notifications.prefs(principalOf(req));
  }

  @HrmsRoles(...ALL)
  @Put('email-prefs')
  updatePrefs(@Req() req: HrmsAuthedRequest, @Body() dto: UpdateEmailPrefsDto) {
    return this.notifications.updatePrefs(principalOf(req), dto);
  }

  @HrmsRoles(...ALL)
  @HttpCode(HttpStatus.OK)
  @Post('read-all')
  readAll(@Req() req: HrmsAuthedRequest) {
    return this.notifications.markAllRead(principalOf(req));
  }

  @HrmsRoles(...ALL)
  @HttpCode(HttpStatus.OK)
  @Post(':id/read')
  read(@Req() req: HrmsAuthedRequest, @Param('id') id: string) {
    return this.notifications.markRead(principalOf(req), /^\d{1,18}$/.test(id) ? id : '0');
  }
}
