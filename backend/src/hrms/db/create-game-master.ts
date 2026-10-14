/**
 * Creates the first gameMaster of a new HRMS database. Run once, as the database OWNER.
 *
 *   GAME_MASTER_EMAIL=owner@example.com \
 *   GAME_MASTER_PASSWORD='a-long-one-time-password' \
 *   GAME_MASTER_NAME='Site Owner' \
 *   HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms \
 *   pnpm --filter backend db:create-game-master:hrms
 *
 * The app role can never create a bootstrap gameMaster, so this is the only way in. Later
 * gameMasters are added in the console and confirmed by a different gameMaster. The first
 * sign-in forces the authenticator enrolment. Nothing is printed except the outcome.
 */
import { config } from 'dotenv';
import { Client } from 'pg';
import { hashPassword } from '../../common/utils/passwords';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const url = process.env.HRMS_MIGRATE_DATABASE_URL;
  const email = process.env.GAME_MASTER_EMAIL?.trim().toLowerCase();
  const password = process.env.GAME_MASTER_PASSWORD;
  const name = process.env.GAME_MASTER_NAME?.trim();

  if (!url) throw new Error('HRMS_MIGRATE_DATABASE_URL is required (the database owner login).');
  if (!email || !password || !name) {
    throw new Error('GAME_MASTER_EMAIL, GAME_MASTER_PASSWORD and GAME_MASTER_NAME are required.');
  }
  if (password.length < 10 || password.length > 128) {
    throw new Error('The password must be 10 to 128 characters.');
  }
  if (password.toLowerCase() === email) throw new Error('The password must not be the email address.');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SET search_path = hrms, public');
    const existing = await client.query('select 1 from users where email = $1', [email]);
    if (existing.rows.length > 0) throw new Error('That email already has an account. Nothing was changed.');

    const hash = await hashPassword(password);
    await client.query('begin');
    const user = await client.query<{ id: string }>(
      `insert into users (email, password_hash, full_name, email_verified_at)
       values ($1, $2, $3, now()) returning id`,
      [email, hash, name],
    );
    await client.query(
      `insert into game_masters (user_id, status, confirmed_at) values ($1, 'active', now())`,
      [user.rows[0].id],
    );
    await client.query('commit');
    console.log(`gameMaster created for ${email}. Sign in at /login; the first sign-in enrols two-step.`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
