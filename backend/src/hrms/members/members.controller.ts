import {
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import {
  CreateMemberDto,
  ListMembersQueryDto,
  SuspendMembersDto,
  UpdateMemberDto,
} from './dto/members.dto';
import { MembersService } from './members.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

@HrmsController('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @HrmsRoles('ceo', 'coo', 'manager')
  @Get()
  list(@Req() req: HrmsAuthedRequest, @Query() query: ListMembersQueryDto) {
    return this.members.list(principalOf(req), query);
  }

  // Declared before ':id' so it is not read as an id.
  @HrmsRoles('ceo')
  @Get('downgrade-candidates')
  downgradeCandidates() {
    return this.members.downgradeCandidates();
  }

  // Everyone may read themselves; the service scopes what else each role sees.
  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Get(':id')
  get(@Req() req: HrmsAuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.get(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo')
  @Post()
  create(@Req() req: HrmsAuthedRequest, @Body() dto: CreateMemberDto) {
    return this.members.create(principalOf(req), dto);
  }

  @HrmsRoles('ceo')
  @Post('suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@Body() dto: SuspendMembersDto) {
    return this.members.suspend(dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Patch(':id')
  update(
    @Req() req: HrmsAuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.update(principalOf(req), id, dto);
  }

  @HrmsRoles('ceo', 'coo')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Req() req: HrmsAuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.deactivate(principalOf(req), id);
  }

  // Forgotten or shared password: a new one-time password, shown once to the CEO or COO.
  @HrmsRoles('ceo', 'coo')
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Req() req: HrmsAuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.resetPassword(principalOf(req), id);
  }

  // Makes the person set up the authenticator at their next sign-in (the admin never sees it).
  @HrmsRoles('ceo', 'coo')
  @Post(':id/require-mfa')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requireMfa(
    @Req() req: HrmsAuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.members.requireMfa(principalOf(req), id);
  }

  // Lost phone: turns the person's authenticator off so their password works again.
  @HrmsRoles('ceo', 'coo')
  @Post(':id/reset-mfa')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetMfa(
    @Req() req: HrmsAuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.members.resetMfa(principalOf(req), id);
  }
}
