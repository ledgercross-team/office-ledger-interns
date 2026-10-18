import {
  BadRequestException,
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
import { networkInterfaces } from 'node:os';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import { HrmsController } from '../hrms-controller.decorator';
import {
  CreateHolidayDto,
  CreateLeaveTypeDto,
  CreateOfficeNetworkDto,
  UpdateLeaveTypeDto,
  UpdateOrgSettingsDto,
} from './dto/org.dto';
import { OrgService } from './org.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@HrmsController('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  // Name and settings for everyone in the org; seat usage only for CEO and COO.
  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Get()
  get(@Req() req: HrmsAuthedRequest) {
    const role = req.hrmsAuth?.role;
    return this.org.get(role === 'ceo' || role === 'coo');
  }

  @HrmsRoles('ceo')
  @Patch('settings')
  updateSettings(@Body() dto: UpdateOrgSettingsDto) {
    return this.org.updateSettings(dto);
  }

  // The address the API sees for this request, and the network to record for "this Wi-Fi":
  // a public address is recorded as itself (everyone behind the same router shares it); a
  // private one stands for its /24; localhost (API on the same machine) uses this machine's LAN.
  @HrmsRoles('ceo', 'coo')
  @Get('my-ip')
  myIp(@Req() req: HrmsAuthedRequest) {
    const ip = req.ip?.replace(/^::ffff:/i, '') ?? null;
    if (!ip) return { ip: null, network: null, kind: null };
    const lan = (v4: string) => `${v4.split('.').slice(0, 3).join('.')}.0/24`;
    const isV4 = /^\d+\.\d+\.\d+\.\d+$/.test(ip);
    const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
    if (isV4 && isPrivate(ip)) return { ip, network: lan(ip), kind: 'lan' as const };
    if (ip === '::1' || ip.startsWith('127.')) {
      const own = Object.entries(networkInterfaces())
        .filter(([name]) => !/^(docker|br-|veth|lo)/.test(name))
        .flatMap(([, list]) => list ?? [])
        .find((a) => a.family === 'IPv4' && !a.internal && isPrivate(a.address));
      return { ip, network: own ? lan(own.address) : null, kind: 'local' as const };
    }
    return { ip, network: isV4 ? `${ip}/32` : `${ip}/128`, kind: 'public' as const };
  }

  @HrmsRoles('ceo', 'coo')
  @Get('office-networks')
  listNetworks() {
    return this.org.listNetworks();
  }

  @HrmsRoles('ceo', 'coo')
  @Post('office-networks')
  addNetwork(@Body() dto: CreateOfficeNetworkDto) {
    return this.org.addNetwork(dto);
  }

  @HrmsRoles('ceo', 'coo')
  @Delete('office-networks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeNetwork(@Param('id', ParseUUIDPipe) id: string) {
    return this.org.removeNetwork(id);
  }

  // Holidays and leave types are read by everyone (calendar, leave form); only the CEO edits.
  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Get('holidays')
  listHolidays(@Query('year') year?: string) {
    const parsed = year === undefined ? undefined : Number(year);
    return this.org.listHolidays(
      parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined,
    );
  }

  @HrmsRoles('ceo')
  @Post('holidays')
  addHoliday(@Body() dto: CreateHolidayDto) {
    return this.org.addHoliday(dto);
  }

  @HrmsRoles('ceo')
  @Delete('holidays/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeHoliday(@Param('date') date: string) {
    if (!ISO_DATE.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    return this.org.removeHoliday(date);
  }

  @HrmsRoles('ceo', 'coo', 'manager', 'employee')
  @Get('leave-types')
  listLeaveTypes() {
    return this.org.listLeaveTypes();
  }

  @HrmsRoles('ceo')
  @Post('leave-types')
  createLeaveType(@Body() dto: CreateLeaveTypeDto) {
    return this.org.createLeaveType(dto);
  }

  @HrmsRoles('ceo')
  @Patch('leave-types/:id')
  updateLeaveType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.org.updateLeaveType(id, dto);
  }
}
