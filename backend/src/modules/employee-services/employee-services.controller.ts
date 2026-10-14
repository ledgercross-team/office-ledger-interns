import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateComplaintDto, CreateLeaveRequestDto } from './dto/employee-services.dto';
import { EmployeeServicesService } from './employee-services.service';

@Roles('employee')
@Controller('employee-services')
export class EmployeeServicesController {
  constructor(private readonly service: EmployeeServicesService) {}

  @Get('leave-requests')
  listLeaveRequests(@CurrentUser() user: AuthUser) {
    return this.service.listLeaveRequests(user);
  }

  @Post('leave-requests')
  createLeaveRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveRequestDto) {
    return this.service.createLeaveRequest(user, dto);
  }

  @Get('complaints')
  listComplaints(@CurrentUser() user: AuthUser) {
    return this.service.listComplaints(user);
  }

  @Post('complaints')
  createComplaint(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.service.createComplaint(user, dto);
  }
}
