import argon2 from 'argon2';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

config({ path: '.env.local' });

const { users } = schema;

// One-off: creates the first game master so someone can log in to a fresh production
// database. The seed never runs in production. Reads GAME_MASTER_EMAIL and
// GAME_MASTER_PASSWORD (and optionally GAME_MASTER_NAME) from the environment.
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.GAME_MASTER_EMAIL?.trim().toLowerCase();
  const password = process.env.GAME_MASTER_PASSWORD;
  const fullName = process.env.GAME_MASTER_NAME?.trim() || 'Game Master';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!email || !email.includes('@')) {
    throw new Error('GAME_MASTER_EMAIL must be set to a valid email address.');
  }
  if (!password || password.length < 10 || password.length > 128) {
    throw new Error('GAME_MASTER_PASSWORD must be set and be 10 to 128 characters.');
  }
  if (password.toLowerCase() === email) {
    throw new Error('GAME_MASTER_PASSWORD must not equal the email address.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new Error(`A user with the email ${email} already exists. Nothing was changed.`);
    }

    await db.insert(users).values({
      companyId: null,
      role: 'game_master',
      email,
      passwordHash: await argon2.hash(password),
      fullName,
      // The password came from an environment variable, so it must be changed at first login.
      mustChangePassword: true,
    });

    console.log(`Created game master ${email}. They must change the password at first login.`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
