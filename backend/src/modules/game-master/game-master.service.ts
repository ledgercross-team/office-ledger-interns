import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';
import { AuthStateService } from '../../auth/auth-state.service';
import { AuthService } from '../../auth/auth.service';
import { TokenService } from '../../auth/token.service';
import { getCompanyDate, isValidTimezone } from '../../common/utils/company-time';
import { isUniqueViolation } from '../../common/utils/db-errors';
import { hashPassword, generateTempPassword } from '../../common/utils/passwords';
import { type Paginated } from '../../common/utils/pagination';
import { DRIZZLE, type Database } from '../../db/db.module';
import { companies, messages, subscriptions, users } from '../../db/schema';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';
import type { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { daysLeft, pickSubscription } from './subscription-utils';

type Company = typeof companies.$inferSelect;

const ADMIN_COLUMNS = { id: users.id, fullName: users.fullName, email: users.email };

@Injectable()
export class GameMasterService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly authService: AuthService,
    private readonly authState: AuthStateService,
    private readonly tokenService: TokenService,
  ) {}

  async listCompanies(page: number, pageSize: number) {
    const [{ total }] = await this.database.select({ total: count() }).from(companies);
    const rows = await this.database
      .select()
      .from(companies)
      .orderBy(asc(companies.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const ids = rows.map((row) => row.id);

    if (ids.length === 0) {
      return { items: [], page, pageSize, total } satisfies Paginated<never>;
    }

    const [admins, subs, unread] = await Promise.all([
      this.database
        .select({ ...ADMIN_COLUMNS, companyId: users.companyId })
        .from(users)
        .where(and(inArray(users.companyId, ids), eq(users.role, 'admin'))),
      this.database.select().from(subscriptions).where(inArray(subscriptions.companyId, ids)),
      // Unread = messages the admin sent that the game master has not read.
      this.database
        .select({ companyId: messages.companyId, unread: count() })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(
          and(inArray(messages.companyId, ids), eq(users.role, 'admin'), isNull(messages.readAt)),
        )
        .groupBy(messages.companyId),
    ]);

    const items = rows.map((company) => {
      const today = getCompanyDate(company.timezone);
      const subscription = pickSubscription(
        subs.filter((row) => row.companyId === company.id),
        today,
      );
      const admin = admins.find((row) => row.companyId === company.id);

      return {
        ...company,
        adminName: admin?.fullName ?? null,
        adminEmail: admin?.email ?? null,
        subscription,
        daysLeft: daysLeft(subscription, today),
        unreadCount: unread.find((row) => row.companyId === company.id)?.unread ?? 0,
      };
    });

    return { items, page, pageSize, total } satisfies Paginated<unknown>;
  }

  async createCompany(creatorId: string, dto: CreateCompanyDto) {
    this.assertTimezone(dto.timezone);
    this.assertDates(dto.startsOn, dto.endsOn);

    const email = dto.adminEmail.trim().toLowerCase();
    await this.assertEmailFree(email);

    const temporaryPassword = generateTempPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const created = await this.database.transaction(async (tx) => {
        const [company] = await tx
          .insert(companies)
          .values({
            name: dto.companyName,
            timezone: dto.timezone,
            workStartTime: dto.workStartTime,
          })
          .returning();

        const [admin] = await tx
          .insert(users)
          .values({
            companyId: company.id,
            role: 'admin',
            email,
            passwordHash,
            fullName: dto.adminFullName,
            mustChangePassword: true,
            createdById: creatorId,
          })
          .returning(ADMIN_COLUMNS);

        const [subscription] = await tx
          .insert(subscriptions)
          .values({
            companyId: company.id,
            planName: dto.planName,
            startsOn: dto.startsOn,
            endsOn: dto.endsOn,
            createdById: creatorId,
          })
          .returning();

        return { company, admin, subscription };
      });

      return { ...created, temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async getCompany(companyId: string) {
    const company = await this.findCompany(companyId);
    const [admin] = await this.database
      .select(ADMIN_COLUMNS)
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.role, 'admin')))
      .limit(1);
    const subs = await this.database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId))
      .orderBy(desc(subscriptions.startsOn));

    return { company, admin: admin ?? null, subscriptions: subs };
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const existing = await this.findCompany(companyId);

    if (dto.timezone !== undefined) {
      this.assertTimezone(dto.timezone);
    }

    const [company] = await this.database
      .update(companies)
      .set({
        name: dto.name,
        timezone: dto.timezone,
        workStartTime: dto.workStartTime,
        isActive: dto.isActive,
      })
      .where(eq(companies.id, companyId))
      .returning();

    if (dto.isActive !== undefined && dto.isActive !== existing.isActive) {
      const members = await this.database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.companyId, companyId));

      for (const member of members) {
        if (dto.isActive) {
          await this.authState.invalidate(member.id);
        } else {
          // Revoking also bumps token_version and drops the cached auth state.
          await this.tokenService.revokeAllForUser(member.id);
        }
      }
    }

    // The subscription window depends on the company timezone.
    await this.authService.invalidateCompanySubscription(companyId);

    return company;
  }

  async resetAdminPassword(companyId: string) {
    await this.findCompany(companyId);
    const [admin] = await this.database
      .select(ADMIN_COLUMNS)
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.role, 'admin')))
      .limit(1);

    if (!admin) {
      throw new NotFoundException('This company has no admin.');
    }

    const temporaryPassword = generateTempPassword();
    await this.database
      .update(users)
      .set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true })
      .where(eq(users.id, admin.id));
    await this.tokenService.revokeAllForUser(admin.id);

    return { temporaryPassword };
  }

  async createSubscription(companyId: string, creatorId: string, dto: CreateSubscriptionDto) {
    await this.findCompany(companyId);
    this.assertDates(dto.startsOn, dto.endsOn);
    await this.assertNoOverlap(companyId, dto.startsOn, dto.endsOn);

    const [subscription] = await this.database
      .insert(subscriptions)
      .values({
        companyId,
        planName: dto.planName,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        notes: dto.notes,
        createdById: creatorId,
      })
      .returning();

    await this.authService.invalidateCompanySubscription(companyId);
    return subscription;
  }

  async updateSubscription(subscriptionId: string, dto: UpdateSubscriptionDto) {
    const [existing] = await this.database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Subscription not found.');
    }

    const endsOn = dto.endsOn ?? existing.endsOn;
    this.assertDates(existing.startsOn, endsOn);

    if (dto.endsOn !== undefined && existing.cancelledAt === null) {
      await this.assertNoOverlap(existing.companyId, existing.startsOn, endsOn, existing.id);
    }

    const [subscription] = await this.database
      .update(subscriptions)
      .set({
        endsOn,
        notes: dto.notes,
        cancelledAt: dto.cancel ? (existing.cancelledAt ?? new Date()) : undefined,
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await this.authService.invalidateCompanySubscription(existing.companyId);
    return subscription;
  }

  private async findCompany(companyId: string): Promise<Company> {
    const [company] = await this.database
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }

  private assertTimezone(timezone: string): void {
    if (!isValidTimezone(timezone)) {
      throw new BadRequestException('timezone must be a valid IANA timezone.');
    }
  }

  private assertDates(startsOn: string, endsOn: string): void {
    if (endsOn < startsOn) {
      throw new BadRequestException('endsOn must not be before startsOn.');
    }
  }

  private async assertEmailFree(email: string): Promise<void> {
    const [existing] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }
  }

  // Cancelled subscriptions do not count.
  private async assertNoOverlap(
    companyId: string,
    startsOn: string,
    endsOn: string,
    ignoreId?: string,
  ): Promise<void> {
    const [overlap] = await this.database
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          isNull(subscriptions.cancelledAt),
          lte(subscriptions.startsOn, endsOn),
          gte(subscriptions.endsOn, startsOn),
          ignoreId ? ne(subscriptions.id, ignoreId) : undefined,
        ),
      )
      .limit(1);

    if (overlap) {
      throw new ConflictException('These dates overlap an existing subscription.');
    }
  }
}
