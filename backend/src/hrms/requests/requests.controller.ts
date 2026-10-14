import { Body, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { BulkRequestsDto, DecideRequestDto, FileRequestDto, ListRequestsQueryDto } from './dto/requests.dto';
import { RequestsService } from './requests.service';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

const uuid = new ParseUUIDPipe();

@HrmsController('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Get()
  list(@Req() req: HrmsAuthedRequest, @Query() query: ListRequestsQueryDto) {
    return this.requests.list(principalOf(req), query);
  }

  // The database decides whether this role may file this type.
  @HrmsRoles('coo', 'manager')
  @Post()
  file(@Req() req: HrmsAuthedRequest, @Body() dto: FileRequestDto) {
    return this.requests.file(principalOf(req), dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @HttpCode(HttpStatus.OK)
  @Post('bulk')
  bulk(@Req() req: HrmsAuthedRequest, @Body() dto: BulkRequestsDto) {
    return this.requests.bulk(principalOf(req), dto);
  }

  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Get(':id')
  get(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.requests.get(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @HttpCode(HttpStatus.OK)
  @Post(':id/approve')
  approve(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.requests.approve(principalOf(req), id);
  }

  @HrmsRoles('ceo', 'coo', 'manager')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  reject(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string, @Body() dto: DecideRequestDto) {
    return this.requests.reject(principalOf(req), id, dto.reason);
  }

  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@Req() req: HrmsAuthedRequest, @Param('id', uuid) id: string) {
    return this.requests.cancel(principalOf(req), id);
  }
}
