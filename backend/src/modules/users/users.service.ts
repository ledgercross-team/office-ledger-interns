import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aliasedTable,
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { AuthStateService } from '../../auth/auth-state.service';
import type { AuthUser, Role } from '../../auth/auth.types';
import { TokenService } from '../../auth/token.service';
import { isUniqueViolation } from '../../common/utils/db-errors';
import { generateTempPassword, hashPassword } from '../../common/utils/passwords';
import { DRIZZLE, type Database } from '../../db/db.module';
import { users } from '../../db/schema';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ListUsersDto } from './dto/list-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { directoryRoles, managedPeople } from './visibility';

const manager = aliasedTable(users, 'manager');

// Never includes passwordHash or tokenVersion.
const USER_COLUMNS = {
  id: users.id,
  companyId: users.companyId,
  role: users.role,
  email: users.email,
  fullName: users.fullName,
  jobTitle: users.jobTitle,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  managerId: users.managerId,
  managerName: manager.fullName,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export interface PersonRow {
  id: string;
  companyId: string | null;
  role: Role;
  email: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  managerId: string | null;
  managerName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly authState: AuthStateService,
    private readonly tokenService: TokenService,
  ) {}

  async list(caller: AuthUser, query: ListUsersDto) {
    const roles = directoryRoles(caller.role).filter((role) => !query.role || role === query.role);
    const search = query.search?.trim();
    const where = and(
      this.directoryScope(caller),
      inArray(users.role, roles),
      query.isActive === undefined ? undefined : eq(users.isActive, query.isActive),
      query.managerId ? eq(users.managerId, query.managerId) : undefined,
      query.unassigned
        ? and(eq(users.role, 'employee'), isNull(users.managerId))
        : undefined,
      search
        ? or(ilike(users.fullName, `%${search}%`), ilike(users.email, `%${search}%`))
        : undefined,
    );

    const [{ total }] = await this.database.select({ total: count() }).from(users).where(where);
    const items = await this.database
      .select(USER_COLUMNS)
      .from(users)
      .leftJoin(manager, eq(manager.id, users.managerId))
      .where(where)
      .orderBy(asc(users.fullName))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async listManagers(caller: AuthUser) {
    const items = await this.database
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(
        and(
          eq(users.companyId, caller.companyId as string),
          eq(users.role, 'manager'),
          eq(users.isActive, true),
        ),
      )
      .orderBy(asc(users.fullName));

    return { items };
  }

  get(caller: AuthUser, userId: string) {
    return this.findVisible(caller, userId);
  }

  async create(caller: AuthUser, dto: CreateUserDto) {
    if (!directoryRoles(caller.role).includes(dto.role)) {
      throw new ForbiddenException('You cannot create a user with this role.');
    }
    if (dto.managerId && dto.role !== 'employee') {
      throw new BadRequestException('Only employees have a manager.');
    }

    // A manager's new employees report to that manager; an admin may pick one or leave it open.
    const managerId = caller.role === 'manager' ? caller.id : (dto.managerId ?? null);
    if (managerId) {
      await this.assertActiveManager(caller, managerId);
    }

    const temporaryPassword = generateTempPassword();

    try {
      const [created] = await this.database
        .insert(users)
        .values({
          companyId: caller.companyId,
          role: dto.role,
          email: dto.email.trim().toLowerCase(),
          passwordHash: await hashPassword(temporaryPassword),
          fullName: dto.fullName,
          jobTitle: dto.jobTitle,
          managerId: dto.role === 'employee' ? managerId : null,
          mustChangePassword: true,
          createdById: caller.id,
        })
        .returning({ id: users.id });

      return { user: await this.load(caller, created.id), temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async update(caller: AuthUser, userId: string, dto: UpdateUserDto) {
    const target = await this.findVisible(caller, userId);

    if (dto.managerId !== undefined) {
      if (target.role !== 'employee') {
        throw new BadRequestException('Only employees have a manager.');
      }
      if (dto.managerId === null) {
        if (caller.role !== 'admin') {
          throw new ForbiddenException('Only an admin can leave an employee without a manager.');
        }
      } else {
        await this.assertActiveManager(caller, dto.managerId);
      }
    }

    if (dto.isActive === false && target.role === 'manager') {
      await this.assertNoActiveReports(userId);
    }

    await this.database
      .update(users)
      .set({
        fullName: dto.fullName,
        jobTitle: dto.jobTitle,
        isActive: dto.isActive,
        managerId: dto.managerId,
      })
      .where(eq(users.id, userId));

    if (dto.isActive === false) {
      // Bumps token_version, revokes refresh tokens and drops the cached auth state.
      await this.tokenService.revokeAllForUser(userId);
    } else {
      await this.authState.invalidate(userId);
    }

    // A manager who hands an employee over no longer sees them, so load by id.
    return this.load(caller, userId);
  }

  async resetPassword(caller: AuthUser, userId: string) {
    await this.findVisible(caller, userId);

    const temporaryPassword = generateTempPassword();
    await this.database
      .update(users)
      .set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true })
      .where(eq(users.id, userId));
    await this.tokenService.revokeAllForUser(userId);

    return { temporaryPassword };
  }

  // The caller's company, minus themselves, narrowed to their team when they are a manager.
  private directoryScope(caller: AuthUser) {
    return and(
      eq(users.companyId, caller.companyId as string),
      ne(users.id, caller.id),
      caller.role === 'manager' ? managedPeople(caller) : undefined,
    );
  }

  // The new manager must be an active manager of the same company.
  private async assertActiveManager(caller: AuthUser, managerId: string): Promise<void> {
    const [row] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, managerId),
          eq(users.companyId, caller.companyId as string),
          eq(users.role, 'manager'),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!row) {
      throw new BadRequestException('Choose an active manager from your company.');
    }
  }

  private async assertNoActiveReports(managerId: string): Promise<void> {
    const [{ total }] = await this.database
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.managerId, managerId), eq(users.isActive, true)));

    if (total > 0) {
      throw new ConflictException(
        `This manager still has ${total} active ${total === 1 ? 'employee' : 'employees'}. Reassign them first.`,
      );
    }
  }

  // Anyone outside the caller's company or scope is a 404, never a 403.
  private findVisible(caller: AuthUser, userId: string): Promise<PersonRow> {
    return this.select(
      and(
        eq(users.id, userId),
        this.directoryScope(caller),
        inArray(users.role, directoryRoles(caller.role)),
      ),
    );
  }

  private load(caller: AuthUser, userId: string): Promise<PersonRow> {
    return this.select(
      and(eq(users.id, userId), eq(users.companyId, caller.companyId as string)),
    );
  }

  private async select(where: SQL | undefined): Promise<PersonRow> {
    const [user] = await this.database
      .select(USER_COLUMNS)
      .from(users)
      .leftJoin(manager, eq(manager.id, users.managerId))
      .where(where)
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }
}
