import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HrmsAuthController } from './auth/hrms-auth.controller';
import { HrmsAuthGuard } from './auth/hrms-auth.guard';
import { HrmsAuthService } from './auth/hrms-auth.service';
import { HrmsTokenService } from './auth/hrms-token.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { ExportController } from './org/export.controller';
import { ExportService } from './org/export.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { CalendarController } from './calendar/calendar.controller';
import { CalendarService } from './calendar/calendar.service';
import { HrmsDbModule } from './db/hrms-db.module';
import { HrmsHealthController } from './hrms-health.controller';
import { HrmsJobsService } from './jobs/jobs.service';
import { MailService } from './mail/mail.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { LeaveController } from './leave/leave.controller';
import { LeaveService } from './leave/leave.service';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { InvitesService } from './projects/invites.service';
import { InvitesController, ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { OrgRecoveryController, PlatformController } from './platform/platform.controller';
import { PlatformService } from './platform/platform.service';
import { RatingsController } from './ratings/ratings.controller';
import { RatingsService } from './ratings/ratings.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { OrgController } from './org/org.controller';
import { OrgService } from './org/org.service';

@Module({
  imports: [HrmsDbModule, JwtModule.register({})],
  controllers: [HrmsHealthController, HrmsAuthController, OrgController, MembersController, ProjectsController, InvitesController, TasksController, RequestsController, AttendanceController, LeaveController, CalendarController, RatingsController, NotificationsController, AuditController, ExportController, PlatformController, OrgRecoveryController],
  providers: [HrmsTokenService, HrmsAuthService, HrmsAuthGuard, OrgService, MembersService, ProjectsService, InvitesService, TasksService, RequestsService, AttendanceService, LeaveService, CalendarService, RatingsService, NotificationsService, MailService, HrmsJobsService, AuditService, ExportService, PlatformService],
})
export class HrmsModule {}
