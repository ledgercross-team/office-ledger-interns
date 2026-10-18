import { prepareDatabaseUrl } from './database-url';

describe('prepareDatabaseUrl', () => {
  it('leaves ordinary local PostgreSQL URLs unchanged', () => {
    const url = 'postgres://user:password@localhost:5432/app';
    expect(prepareDatabaseUrl(url)).toBe(url);
  });

  it('adds Supabase TLS compatibility parameters', () => {
    expect(
      prepareDatabaseUrl(
        'postgresql://user:password@aws-0-region.pooler.supabase.com:5432/postgres',
      ),
    ).toBe(
      'postgresql://user:password@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true',
    );
  });

  it('preserves an explicit SSL mode and adds compatibility for require', () => {
    const url = 'postgresql://user:password@db.example.supabase.co:5432/postgres?sslmode=require';
    expect(prepareDatabaseUrl(url)).toBe(`${url}&uselibpqcompat=true`);
  });
});
