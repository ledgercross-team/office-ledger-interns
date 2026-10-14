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
  AddAssigneeDto,
  ChangeTaskStatusDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/tasks.dto';
import { TasksService } from './tasks.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const ALL = ['ceo', 'coo', 'manager', 'employee'] as const;
const uuid = new ParseUUIDPipe();

// There is deliberately no delete route: a task is cancelled through the status endpoint.
@HrmsController('')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @HrmsRoles(...ALL)
  @Get('tasks')
  list(@Req() req: HrmsAuthedRequest, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(principalOf(req), query);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Post('projects/:projectId/tasks')
  create(
    @Req() req: HrmsAuthedRequest,
    @Param('projectId', uuid) projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(principalOf(req), projectId, dto);
  }

  @HrmsRoles(...ALL)
  @Get('tasks/:id')
  get(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.tasks.get(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Patch('tasks/:id')
  update(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(principalOf(req), id, dto);
  }

  @HrmsRoles(...ALL)
  @Post('tasks/:id/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: ChangeTaskStatusDto,
  ) {
    return this.tasks.changeStatus(principalOf(req), id, dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Post('tasks/:id/assignees')
  addAssignee(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Body() dto: AddAssigneeDto,
  ) {
    return this.tasks.addAssignee(principalOf(req), id, dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @Delete('tasks/:id/assignees/:memberId')
  removeAssignee(
    @Req() req: HrmsAuthedRequest,
    @Param('id', uuid) id: string,
    @Param('memberId', uuid) memberId: string,
  ) {
    return this.tasks.removeAssignee(principalOf(req), id, memberId);
  }

  @HrmsRoles(...ALL)
  @Get('tasks/:id/history')
  history(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.tasks.history(principalOf(req), id);
  }
}
