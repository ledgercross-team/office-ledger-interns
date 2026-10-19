import {
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import {
  BlockOrgDto,
  CreateGameMasterDto,
  CreateOrgDto,
  LastCeoRemovalDto,
  RecoveryRequestDto,
  SetPlanDto,
  UpdatePersonDto,
} from './dto/platform.dto';
import { PlatformService } from './platform.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const uuid = new ParseUUIDPipe();

// Every route calls a gm_* function (or touches only game_masters and users). The gameMaster's
// session has no org, so row-level security hides all organisation data from these queries.
@HrmsController('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @HrmsRoles('gameMaster')
  @Get('orgs')
  orgs() {
    return this.platform.listOrgs();
  }

  @HrmsRoles('gameMaster')
  @Get('plans')
  plans() {
    return this.platform.plans();
  }

  @HrmsRoles('gameMaster')
  @Post('orgs')
  create(@Body() dto: CreateOrgDto) {
    return this.platform.createOrg(dto);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('orgs/:id/block')
  block(@Param('id', uuid) id: string, @Body() dto: BlockOrgDto) {
    return this.platform.setBlocked(id, true, dto.reason.trim());
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('orgs/:id/unblock')
  unblock(@Param('id', uuid) id: string) {
    return this.platform.setBlocked(id, false);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('orgs/:id/plan')
  plan(@Param('id', uuid) id: string, @Body() dto: SetPlanDto) {
    return this.platform.setPlan(id, dto);
  }

  @HrmsRoles('gameMaster')
  @Get('requests')
  requests() {
    return this.platform.listRequests();
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('requests/:id/verify')
  verify(@Param('id', uuid) id: string) {
    return this.platform.verify(id);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('requests/:id/complete')
  complete(@Param('id', uuid) id: string) {
    return this.platform.completeRemoval(id);
  }

  @HrmsRoles('gameMaster')
  @Get('game-masters')
  gameMasters() {
    return this.platform.listGameMasters();
  }

  @HrmsRoles('gameMaster')
  @Post('game-masters')
  createGameMaster(@Req() req: HrmsAuthedRequest, @Body() dto: CreateGameMasterDto) {
    return this.platform.createGameMaster(principalOf(req), dto);
  }

  @HrmsRoles('gameMaster')
  @Patch('game-masters/:userId')
  updateGameMaster(@Param('userId', uuid) userId: string, @Body() dto: UpdatePersonDto) {
    return this.platform.updateGameMaster(userId, dto);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('game-masters/:userId/reset-password')
  resetGameMasterPassword(@Param('userId', uuid) userId: string) {
    return this.platform.resetGameMasterPassword(userId);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('game-masters/:userId/reset-mfa')
  resetGameMasterMfa(@Param('userId', uuid) userId: string) {
    return this.platform.resetGameMasterMfa(userId);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('game-masters/:userId/remove')
  removeGameMaster(@Req() req: HrmsAuthedRequest, @Param('userId', uuid) userId: string) {
    return this.platform.removeGameMaster(principalOf(req), userId);
  }

  // CEOs, per organisation: identity and status only, never org data.
  @HrmsRoles('gameMaster')
  @Get('orgs/:id/ceos')
  orgCeos(@Param('id', uuid) id: string) {
    return this.platform.listOrgCeos(id);
  }

  @HrmsRoles('gameMaster')
  @Patch('ceos/:memberId')
  updateCeo(@Param('memberId', uuid) memberId: string, @Body() dto: UpdatePersonDto) {
    return this.platform.updateCeo(memberId, dto);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('ceos/:memberId/reset-password')
  resetCeoPassword(@Param('memberId', uuid) memberId: string) {
    return this.platform.resetCeoPassword(memberId);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('ceos/:memberId/reset-mfa')
  resetCeoMfa(@Param('memberId', uuid) memberId: string) {
    return this.platform.resetCeoMfa(memberId);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('ceos/:memberId/remove')
  removeCeo(@Param('memberId', uuid) memberId: string) {
    return this.platform.removeCeo(memberId);
  }

  @HrmsRoles('gameMaster')
  @HttpCode(HttpStatus.OK)
  @Post('game-masters/:userId/confirm')
  confirm(@Req() req: HrmsAuthedRequest, @Param('userId', uuid) userId: string) {
    return this.platform.confirmGameMaster(principalOf(req), userId);
  }
}

// The organisation's side: a COO asks for a CEO's access to be recovered, a CEO asks to be
// replaced. The gameMaster decides after checking offline.
@HrmsController('org')
export class OrgRecoveryController {
  constructor(private readonly platform: PlatformService) {}

  @HrmsRoles('coo')
  @Post('recovery-requests')
  recovery(@Req() req: HrmsAuthedRequest, @Body() dto: RecoveryRequestDto) {
    return this.platform.fileRecovery(principalOf(req), dto);
  }

  @HrmsRoles('ceo')
  @Post('last-ceo-removal')
  removal(@Req() req: HrmsAuthedRequest, @Body() dto: LastCeoRemovalDto) {
    return this.platform.fileLastCeoRemoval(principalOf(req), dto);
  }
}
