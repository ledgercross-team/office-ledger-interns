/**
 * Applies the consolidated HRMS schema file to the database, once.
 *
 *   HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms \
 *     pnpm --filter backend exec tsx scripts/hrms-migrate.ts
 *
 * The applied file is recorded in public.hrms_migration_log with its SHA-256. An applied file
 * is never run again, and the script stops if it has changed on disk. The current workflow
 * recreates the database from the consolidated schema when the schema changes.
 *
 * Connect as the database owner, never as hrms_api. This is not the v1 drizzle migrator and
 * never reads DATABASE_URL.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { prepareDatabaseUrl } from '../src/config/database-url';

// Load the backend's local environment for manual migrations. Existing process
// environment variables win, so CI/Render can still inject the URL directly.
loadEnv({ path: resolve(__dirname, '../.env.local') });
loadEnv({ path: resolve(__dirname, '../../.env') });

const SQL_DIR = resolve(__dirname, '../../docs/hrms');
const SCHEMA_FILE = 'hrms_schema.sql';

export function listMigrationFiles(names: string[]): string[] {
  return names.includes(SCHEMA_FILE) ? [SCHEMA_FILE] : [];
}

async function main(): Promise<void> {
  const url = process.env.HRMS_MIGRATE_DATABASE_URL;
  if (!url) throw new Error('HRMS_MIGRATE_DATABASE_URL is required (database owner login).');

  const files = listMigrationFiles(readdirSync(SQL_DIR));
  if (!files.includes(SCHEMA_FILE)) throw new Error(`${SCHEMA_FILE} not found in ${SQL_DIR}`);

  const client = new Client({ connectionString: prepareDatabaseUrl(url) });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.hrms_migration_log (
        filename   text PRIMARY KEY,
        sha256     text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    // This bookkeeping table is not application data. Keep it owner-only and make the
    // intended deny-by-default posture explicit for Supabase/PostgREST security checks.
    // The migration connection owns the table, so it can still read and write it.
    await client.query(`
      ALTER TABLE public.hrms_migration_log ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.hrms_migration_log FROM PUBLIC;
    `);
    const { rows } = await client.query<{ filename: string; sha256: string }>(
      'SELECT filename, sha256 FROM public.hrms_migration_log',
    );
    const applied = new Map(rows.map((row) => [row.filename, row.sha256]));

    for (const filename of files) {
      const sql = readFileSync(join(SQL_DIR, filename), 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      const previous = applied.get(filename);
      if (previous !== undefined) {
        if (previous !== sha256) {
          throw new Error(
            `${filename} was applied earlier but has changed on disk. Reset and rebuild the database before applying the new consolidated schema.`,
          );
        }
        console.log(`skip   ${filename}`);
        continue;
      }
      // Files carry their own BEGIN/COMMIT, so a failure rolls the file back as a whole.
      await client.query(sql);
      await client.query(
        'INSERT INTO public.hrms_migration_log (filename, sha256) VALUES ($1, $2)',
        [filename, sha256],
      );
      console.log(`apply  ${filename}`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
