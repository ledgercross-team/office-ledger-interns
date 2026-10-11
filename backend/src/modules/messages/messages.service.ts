import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { AuthUser } from '../../auth/auth.types';
import { DRIZZLE, type Database } from '../../db/db.module';
import { companies, messages, users } from '../../db/schema';

const PAGE_SIZE = 50;

const MESSAGE_COLUMNS = {
  id: messages.id,
  companyId: messages.companyId,
  senderId: messages.senderId,
  senderName: users.fullName,
  body: messages.body,
  readAt: messages.readAt,
  createdAt: messages.createdAt,
};

@Injectable()
export class MessagesService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  // Newest 50, returned oldest first. Pass the oldest createdAt as `before` for older ones.
  async list(user: AuthUser, companyId: string, before?: string) {
    await this.assertThread(user, companyId);

    const rows = await this.database
      .select(MESSAGE_COLUMNS)
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.companyId, companyId),
          before ? lt(messages.createdAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(PAGE_SIZE);

    return { items: rows.reverse() };
  }

  async send(user: AuthUser, companyId: string, body: string) {
    await this.assertThread(user, companyId);

    const [created] = await this.database
      .insert(messages)
      .values({ companyId, senderId: user.id, body })
      .returning({ id: messages.id });

    const [message] = await this.database
      .select(MESSAGE_COLUMNS)
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.id, created.id));

    return message;
  }

  // Marks only the other side's messages: the admin's for the game master, and vice versa.
  async markRead(user: AuthUser, companyId: string) {
    await this.assertThread(user, companyId);

    const otherSide = await this.otherSideSenders(companyId, user);
    const marked = await this.database
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.companyId, companyId),
          isNull(messages.readAt),
          inArray(messages.senderId, otherSide),
        ),
      )
      .returning({ id: messages.id });

    return { marked: marked.length };
  }

  // Messages from the game master that the company's admin has not read yet.
  async unreadForAdmin(companyId: string): Promise<number> {
    const [row] = await this.database
      .select({ unread: count() })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.companyId, companyId),
          eq(users.role, 'game_master'),
          isNull(messages.readAt),
        ),
      );
    return row.unread;
  }

  // The game master may open any company's thread, an admin only their own. Else 404.
  private async assertThread(user: AuthUser, companyId: string): Promise<void> {
    if (user.role === 'admin' && user.companyId !== companyId) {
      throw new NotFoundException('Thread not found.');
    }

    const [company] = await this.database
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      throw new NotFoundException('Thread not found.');
    }
  }

  private async otherSideSenders(companyId: string, user: AuthUser): Promise<string[]> {
    const rows =
      user.role === 'game_master'
        ? await this.database
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.companyId, companyId), eq(users.role, 'admin')))
        : await this.database
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, 'game_master'));

    return rows.map((row) => row.id);
  }
}
