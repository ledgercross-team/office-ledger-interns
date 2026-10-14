// drizzle's driver returns timestamps as strings; the API returns ISO strings.
export function iso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value).toISOString();
}
