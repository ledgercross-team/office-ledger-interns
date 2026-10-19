import {
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import {
  FileReportDto,
  GmStartThreadDto,
  RecipientsQueryDto,
  ReplyDto,
  StartThreadDto,
} from './dto/messages.dto';
import { MessagesService } from './messages.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const uuid = new ParseUUIDPipe();
// 30 sends a minute per person: a conversation, not a firehose.
const SEND_RATE = { default: { limit: 30, ttl: 60_000 } };
const ORG = ['ceo', 'coo', 'manager', 'employee'] as const;

// There is no push channel: screens ask again every 5 to 10 seconds. A whole office shares
// one IP, so these cheap, signed-in reads are exempt from the per-IP limit (writes are not).
@HrmsController('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @HrmsRoles(...ORG)
  @SkipThrottle()
  @Get('recipients')
  recipients(@Req() req: HrmsAuthedRequest, @Query() q: RecipientsQueryDto) {
    return this.messages.recipients(principalOf(req), q.q, q.role);
  }

  @HrmsRoles(...ORG)
  @SkipThrottle()
  @Get('threads')
  threads(@Req() req: HrmsAuthedRequest) {
    return this.messages.threads(principalOf(req));
  }

  @HrmsRoles(...ORG)
  @SkipThrottle()
  @Get('threads/:id')
  thread(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.messages.thread(principalOf(req), id);
  }

  @HrmsRoles(...ORG)
  @Throttle(SEND_RATE)
  @Post('threads')
  start(@Req() req: HrmsAuthedRequest, @Body() dto: StartThreadDto) {
    return this.messages.start(principalOf(req), dto);
  }

  @HrmsRoles(...ORG)
  @Throttle(SEND_RATE)
  @Post('threads/:id/reply')
  reply(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string, @Body() dto: ReplyDto) {
    return this.messages.reply(principalOf(req), id, dto.body);
  }

  @HrmsRoles(...ORG)
  @Post('threads/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string): Promise<void> {
    await this.messages.markRead(principalOf(req), id);
  }

  @HrmsRoles(...ORG)
  @Post('hide/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hide(@Req() req: HrmsAuthedRequest, @Param('messageId') messageId: string): Promise<void> {
    // A bigint id; anything else cannot match a message.
    await this.messages.hide(principalOf(req), /^\d{1,18}$/.test(messageId) ? messageId : '0');
  }

  @HrmsRoles(...ORG)
  @SkipThrottle()
  @Get('unread-count')
  unread(@Req() req: HrmsAuthedRequest) {
    return this.messages.unreadCount(principalOf(req));
  }
}

@HrmsController('reports')
export class ReportsController {
  constructor(private readonly messages: MessagesService) {}

  @HrmsRoles('coo', 'manager', 'employee')
  @SkipThrottle()
  @Get('ceos')
  ceos() {
    return this.messages.reportRecipients();
  }

  @HrmsRoles('coo', 'manager', 'employee')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  file(@Req() req: HrmsAuthedRequest, @Body() dto: FileReportDto) {
    return this.messages.fileReport(principalOf(req), dto);
  }

  @HrmsRoles('ceo')
  @SkipThrottle()
  @Get()
  inbox() {
    return this.messages.reportsForCeo();
  }

  @HrmsRoles('coo', 'manager', 'employee')
  @SkipThrottle()
  @Get('mine')
  mine() {
    return this.messages.myReports();
  }

  @HrmsRoles(...ORG)
  @SkipThrottle()
  @Get(':id')
  thread(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.messages.reportThread(principalOf(req), id);
  }

  @HrmsRoles(...ORG)
  @Throttle(SEND_RATE)
  @Post(':id/reply')
  async reply(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string, @Body() dto: ReplyDto) {
    await this.messages.replyToReport(principalOf(req), id, dto.body);
    return { reportId: id };
  }

  @HrmsRoles(...ORG)
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param('id', uuid) id: string): Promise<void> {
    await this.messages.markReportRead(id);
  }
}

// The gameMaster has no organisation and the access rules keep them under /api/platform,
// so their messages live here. Every call is a database function.
@HrmsController('platform/messages')
export class PlatformMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @HrmsRoles('gameMaster')
  @SkipThrottle()
  @Get('contacts')
  contacts(@Query() q: RecipientsQueryDto) {
    return this.messages.gmContacts(q.q);
  }

  @HrmsRoles('gameMaster')
  @SkipThrottle()
  @Get('threads')
  threads() {
    return this.messages.gmThreads();
  }

  @HrmsRoles('gameMaster')
  @SkipThrottle()
  @Get('threads/:id')
  thread(@Param('id', uuid) id: string) {
    return this.messages.gmThread(id);
  }

  @HrmsRoles('gameMaster')
  @Throttle(SEND_RATE)
  @Post('threads')
  start(@Body() dto: GmStartThreadDto) {
    return this.messages.gmStart(dto);
  }

  @HrmsRoles('gameMaster')
  @Throttle(SEND_RATE)
  @Post('threads/:id/reply')
  reply(@Param('id', uuid) id: string, @Body() dto: ReplyDto) {
    return this.messages.gmReply(id, dto.body);
  }

  @HrmsRoles('gameMaster')
  @Post('threads/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param('id', uuid) id: string): Promise<void> {
    await this.messages.gmMarkRead(id);
  }

  @HrmsRoles('gameMaster')
  @SkipThrottle()
  @Get('unread-count')
  unread() {
    return this.messages.gmUnread();
  }
}
