import { Module } from '@nestjs/common';
import { CompanySubscriptionService } from './company-subscription.service';

@Module({
  providers: [CompanySubscriptionService],
  exports: [CompanySubscriptionService],
})
export class CompanyModule {}
