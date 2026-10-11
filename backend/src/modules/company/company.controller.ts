import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CompanyService } from './company.service';

@Controller('company')
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @Roles('admin')
  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.service.getSubscriptions(user.companyId as string);
  }
}
