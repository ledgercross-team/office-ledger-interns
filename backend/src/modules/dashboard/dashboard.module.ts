import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MessagesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
