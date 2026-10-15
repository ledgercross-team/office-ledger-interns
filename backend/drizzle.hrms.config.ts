import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../.env' });

// Used only for `drizzle-kit pull` of the HRMS database. Never run `generate` or `migrate`
// with this config: changes to that database are numbered SQL files in docs/hrms/.
export default defineConfig({
  schema: './src/hrms/db/schema/index.ts',
  out: './src/hrms/db/.pull-output',
  dialect: 'postgresql',
  schemaFilter: ['hrms'],
  dbCredentials: { url: process.env.DATABASE_URL as string },
});
