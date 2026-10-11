import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { getCompanyDate } from '../../common/utils/company-time';
import { DRIZZLE, type Database } from '../../db/db.module';
import { companies, subscriptions } from '../../db/schema';
import { daysLeft, pickSubscription } from '../game-master/subscription-utils';

@Injectable()
export class CompanyService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  async getSubscriptions(companyId: string) {
    const [company] = await this.database
      .select({ timezone: companies.timezone })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const items = await this.database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId))
      .orderBy(desc(subscriptions.startsOn));

    const today = getCompanyDate(company?.timezone ?? 'UTC');
    const current = pickSubscription(items, today);

    return { current, daysLeft: daysLeft(current, today), items };
  }
}
