import {
  Body,
  Delete,
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
  AddProjectMemberDto,
  CreateProjectDto,
  DeclineInviteDto,
  ListProjectsQueryDto,
  ReviewInviteDto,
  SendInviteDto,
  SetLeadDto,
  UpdateProjectDto,
} from './dto/projects.dto';
import { InvitesService } from './invites.service';
import { ProjectsService } from './projects.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;
const uuid = new ParseUUIDPipe();

@HrmsController('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly invites: InvitesService,
  ) {}

  @HrmsRoles(...ALL)
  @Get()
  list(@Req() req: HrmsAuthedRequest, @Query() query: ListProjectsQueryDto) {
    return this.projects.list(principalOf(req), query);
  }

  // Only a CEO creates a project directly. A COO files a request (Phase 7), and the
  // database refuses a COO insert even if this check were removed.
  @HrmsRoles('ceo')
  @Post()
  create(@Req() req: HrmsAuthedRequest, @Body() dto: CreateProjectDto) {
    return this.projects.create(principalOf(req), dto);
  }

  @HrmsRoles(...ALL)
  @Get(':id')
  get(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.projects.get(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Patch(':id')
  update(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(principalOf(req), id, dto);
  }

  @HrmsRoles('ceo')
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.projects.archive(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo')
  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.projects.reopen(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo')
  @Post(':id/members')
  addMember(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.projects.addMember(principalOf(req), id, dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Delete(':id/members/:memberId')
  removeMember(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Param('memberId', uuid) memberId: string,
  ) {
    return this.projects.removeMember(principalOf(req), id, memberId);
  }

  @HrmsRoles('ceo', 'coo')
  @Patch(':id/members/:memberId/lead')
  setLead(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Param('memberId', uuid) memberId: string,
    @Body() dto: SetLeadDto,
  ) {
    return this.projects.setLead(principalOf(req), id, memberId, dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Post(':id/invites')
  sendInvite(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: SendInviteDto,
  ) {
    return this.invites.send(principalOf(req), id, dto);
  }

  @HrmsRoles('manager')
  @Post(':id/tick')
  @HttpCode(HttpStatus.OK)
  tick(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.projects.tick(principalOf(req), id);
  }

  // A lead approves; with no lead the CEO or COO does. The database decides who may.
  @HrmsRoles('ceo', 'coo', 'manager')
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.projects.complete(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Post(':id/send-back')
  @HttpCode(HttpStatus.OK)
  sendBack(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.projects.sendBack(principalOf(req), id);
  }
}

// Invites live outside /projects, so this controller sits at the API root.
@HrmsController('')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @HrmsRoles(...ALL)
  @Get('me/invites')
  mine(@Req() req: HrmsAuthedRequest) {
    return this.invites.mine(principalOf(req));
  }

  @HrmsRoles('manager', 'employee')
  @Post('invites/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id', uuid) id: string) {
    return this.invites.accept(id);
  }

  @HrmsRoles('manager', 'employee')
  @Post('invites/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@Param('id', uuid) id: string, @Body() dto: DeclineInviteDto) {
    return this.invites.decline(id, dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Post('invites/:id/review')
  @HttpCode(HttpStatus.OK)
  review(@Param('id', uuid) id: string, @Body() dto: ReviewInviteDto) {
    return this.invites.review(id, dto);
  }
}
