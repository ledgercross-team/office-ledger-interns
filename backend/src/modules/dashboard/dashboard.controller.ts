import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Roles('admin', 'manager', 'employee')
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user);
  }
}
