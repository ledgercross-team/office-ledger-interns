/**
 * Applies the HRMS SQL files in docs/hrms/ to the new database, in order, once each.
 *
 *   HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms \
 *     pnpm --filter backend exec tsx scripts/hrms-migrate.ts
 *
 * Order: hrms_schema.sql first, then NNNN_*.sql by number. Each applied file is recorded in
 * public.hrms_migration_log with its SHA-256. An applied file is never run again, and the
 * script stops if an applied file has changed on disk: add a new numbered file instead.
 *
 * Connect as the database owner, never as hrms_api. This is not the v1 drizzle migrator and
 * never reads DATABASE_URL.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

const SQL_DIR = resolve(__dirname, '../../docs/hrms');
const BASE_FILE = 'hrms_schema.sql';
const NUMBERED = /^(\d{4})_[A-Za-z0-9_-]+\.sql$/;

export function listMigrationFiles(names: string[]): string[] {
  const numbered = names
    .filter((name) => NUMBERED.test(name))
    .sort((a, b) => a.localeCompare(b));
  const seen = new Set<string>();
  for (const name of numbered) {
    const prefix = name.slice(0, 4);
    if (seen.has(prefix)) throw new Error(`Two migration files share the number ${prefix}`);
    seen.add(prefix);
  }
  return names.includes(BASE_FILE) ? [BASE_FILE, ...numbered] : numbered;
}

async function main(): Promise<void> {
  const url = process.env.HRMS_MIGRATE_DATABASE_URL;
  if (!url) throw new Error('HRMS_MIGRATE_DATABASE_URL is required (database owner login).');

  const files = listMigrationFiles(readdirSync(SQL_DIR));
  if (!files.includes(BASE_FILE)) throw new Error(`${BASE_FILE} not found in ${SQL_DIR}`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.hrms_migration_log (
        filename   text PRIMARY KEY,
        sha256     text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
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
            `${filename} was applied earlier but has changed on disk. Applied files are never edited: add a new numbered file.`,
          );
        }
        console.log(`skip   ${filename}`);
        continue;
      }
      // Files carry their own BEGIN/COMMIT, so a failure rolls the file back as a whole.
      await client.query(sql);
      await client.query('INSERT INTO public.hrms_migration_log (filename, sha256) VALUES ($1, $2)', [
        filename,
        sha256,
      ]);
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
