/**
 * Supabase PostgreSQL endpoints require TLS. Keep local PostgreSQL URLs unchanged,
 * but make an omitted SSL mode safe for Supabase's direct and pooler hostnames.
 * pg v8 currently treats `sslmode=require` as certificate verification unless
 * libpq-compatible parsing is explicitly requested, which rejects Supabase's
 * pooler certificate chain in this environment.
 */
export function prepareDatabaseUrl(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return connectionString;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isSupabase = hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.com');
  if (!isSupabase) return connectionString;

  const additions: string[] = [];
  const sslMode = parsed.searchParams.get('sslmode');
  if (!sslMode) additions.push('sslmode=require');
  if (sslMode === null || sslMode === 'require') {
    if (!parsed.searchParams.has('uselibpqcompat')) additions.push('uselibpqcompat=true');
  }
  if (additions.length === 0) return connectionString;

  const separator = connectionString.includes('?')
    ? connectionString.endsWith('?')
      ? ''
      : '&'
    : '?';
  return `${connectionString}${separator}${additions.join('&')}`;
}
