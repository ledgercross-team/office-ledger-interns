// ConfigService returns booleans once env validation has run, but raw process.env values
// are strings; accept both so a flag is never silently read as "off".
export function isEnabled(value: unknown): boolean {
  return value === true || value === 'true';
}
