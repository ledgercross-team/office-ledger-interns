import { Module } from '@nestjs/common';
import { EmployeeServicesController } from './employee-services.controller';
import { EmployeeServicesService } from './employee-services.service';

@Module({
  controllers: [EmployeeServicesController],
  providers: [EmployeeServicesService],
})
export class EmployeeServicesModule {}
