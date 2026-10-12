import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/utils/pagination';
import { CreateAdminDto, UpdateAdminDto } from './dto/admins.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { GameMasterService } from './game-master.service';

const RESET_RATE = { limit: 30, ttl: 60 * 60 * 1000 };

@Roles('game_master')
@Controller('game-master')
export class GameMasterController {
  constructor(private readonly service: GameMasterService) {}

  @Get('companies')
  list(@Query() query: PaginationQueryDto) {
    return this.service.listCompanies(query.page, query.pageSize);
  }

  @Post('companies')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.service.createCompany(user.id, dto);
  }

  @Get('companies/:companyId')
  get(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.service.getCompany(companyId);
  }

  @Patch('companies/:companyId')
  update(@Param('companyId', ParseUUIDPipe) companyId: string, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompany(companyId, dto);
  }

  @Throttle({ default: RESET_RATE })
  @Post('companies/:companyId/admins')
  createAdmin(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdminDto,
  ) {
    return this.service.createAdmin(companyId, user.id, dto);
  }

  @Patch('companies/:companyId/admins/:adminId')
  updateAdmin(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.service.updateAdmin(companyId, adminId, dto);
  }

  @Throttle({ default: RESET_RATE })
  @Post('companies/:companyId/admins/:adminId/reset-password')
  resetAdminPassword(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('adminId', ParseUUIDPipe) adminId: string,
  ) {
    return this.service.resetAdminPassword(companyId, adminId);
  }

  @Post('companies/:companyId/subscriptions')
  createSubscription(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.service.createSubscription(companyId, user.id, dto);
  }

  @Patch('subscriptions/:subscriptionId')
  updateSubscription(
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.service.updateSubscription(subscriptionId, dto);
  }
}
