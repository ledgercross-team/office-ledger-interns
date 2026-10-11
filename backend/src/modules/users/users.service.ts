import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { AuthStateService } from '../../auth/auth-state.service';
import type { AuthUser } from '../../auth/auth.types';
import { TokenService } from '../../auth/token.service';
import { isUniqueViolation } from '../../common/utils/db-errors';
import { generateTempPassword, hashPassword } from '../../common/utils/passwords';
import { DRIZZLE, type Database } from '../../db/db.module';
import { users } from '../../db/schema';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ListUsersDto } from './dto/list-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { manageableRoles } from './visibility';

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
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly authState: AuthStateService,
    private readonly tokenService: TokenService,
  ) {}

  async list(caller: AuthUser, query: ListUsersDto) {
    const roles = manageableRoles(caller.role).filter((role) => !query.role || role === query.role);
    const search = query.search?.trim();
    const where = and(
      eq(users.companyId, caller.companyId as string),
      inArray(users.role, roles),
      query.isActive === undefined ? undefined : eq(users.isActive, query.isActive),
      search
        ? or(ilike(users.fullName, `%${search}%`), ilike(users.email, `%${search}%`))
        : undefined,
    );

    const [{ total }] = await this.database.select({ total: count() }).from(users).where(where);
    const items = await this.database
      .select(USER_COLUMNS)
      .from(users)
      .where(where)
      .orderBy(asc(users.fullName))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  get(caller: AuthUser, userId: string) {
    return this.findVisible(caller, userId);
  }

  async create(caller: AuthUser, dto: CreateUserDto) {
    if (!manageableRoles(caller.role).includes(dto.role)) {
      throw new ForbiddenException('You cannot create a user with this role.');
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
          mustChangePassword: true,
          createdById: caller.id,
        })
        .returning(USER_COLUMNS);

      return { user: created, temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async update(caller: AuthUser, userId: string, dto: UpdateUserDto) {
    await this.findVisible(caller, userId);

    const [updated] = await this.database
      .update(users)
      .set({ fullName: dto.fullName, jobTitle: dto.jobTitle, isActive: dto.isActive })
      .where(eq(users.id, userId))
      .returning(USER_COLUMNS);

    if (dto.isActive === false) {
      // Bumps token_version, revokes refresh tokens and drops the cached auth state.
      await this.tokenService.revokeAllForUser(userId);
    } else {
      await this.authState.invalidate(userId);
    }

    return updated;
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

  // Anyone outside the caller's company or role scope is a 404, never a 403.
  private async findVisible(caller: AuthUser, userId: string) {
    const [user] = await this.database
      .select(USER_COLUMNS)
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.companyId, caller.companyId as string),
          inArray(users.role, manageableRoles(caller.role)),
        ),
      )
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }
}
