import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ListMessagesQueryDto, SendMessageDto } from './dto/messages.dto';
import { MessagesService } from './messages.service';

@Roles('game_master', 'admin')
@Controller('message-threads')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get('unread')
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.service.unreadCount(user) };
  }

  @Get(':companyId/messages')
  list(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.service.list(user, companyId, query.before);
  }

  @Post(':companyId/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.send(user, companyId, dto.body);
  }

  @Post(':companyId/mark-read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: AuthUser, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.service.markRead(user, companyId);
  }
}
