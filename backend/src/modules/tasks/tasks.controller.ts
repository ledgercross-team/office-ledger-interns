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
import {
  CommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  StatusChangeDto,
  UpdateTaskDto,
} from './dto/tasks.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Roles('admin', 'manager', 'employee')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQueryDto) {
    return this.service.list(user, query);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.service.create(user, dto);
  }

  @Roles('admin', 'manager', 'employee')
  @Get(':taskId')
  get(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.service.get(user, taskId);
  }

  @Roles('admin', 'manager')
  @Patch(':taskId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.update(user, taskId, dto);
  }

  @Roles('admin', 'manager', 'employee')
  @Post(':taskId/status-changes')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: StatusChangeDto,
  ) {
    return this.service.changeStatus(user, taskId, dto);
  }

  @Roles('admin', 'manager', 'employee')
  @Post(':taskId/comments')
  comment(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CommentDto,
  ) {
    return this.service.comment(user, taskId, dto);
  }

  @Roles('admin', 'manager', 'employee')
  @Get(':taskId/activity')
  activity(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.service.activity(user, taskId);
  }
}
