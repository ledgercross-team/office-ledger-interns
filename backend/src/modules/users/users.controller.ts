import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const CREATE_RATE = { limit: 30, ttl: 60 * 60 * 1000 };

@Roles('admin', 'manager')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListUsersDto) {
    return this.service.list(user, query);
  }

  // Task assignment choices are broader than the normal manager directory:
  // a manager may request approval to assign any active employee.
  @Get('assignable')
  assignable(@CurrentUser() user: AuthUser) {
    return this.service.listAssignable(user);
  }

  @Throttle({ default: CREATE_RATE })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.service.create(user, dto);
  }

  // Active managers of the caller's company: the choices when handing an employee over.
  @Get('managers')
  managers(@CurrentUser() user: AuthUser) {
    return this.service.listManagers(user);
  }

  @Get(':userId')
  get(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.get(user, userId);
  }

  @Patch(':userId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(user, userId, dto);
  }

  @Throttle({ default: CREATE_RATE })
  @Post(':userId/reset-password')
  resetPassword(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.resetPassword(user, userId);
  }
}
