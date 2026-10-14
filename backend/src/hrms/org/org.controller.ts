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
    return this.org.listHolidays(parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined);
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
