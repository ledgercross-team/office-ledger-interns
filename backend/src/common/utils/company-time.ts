const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getCompanyDate(timezone: string, at: Date = new Date()): string {
  const formatted =
    timezone === 'UTC'
      ? DATE_FORMAT.format(at)
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(at);

  // en-CA already produces YYYY-MM-DD; be robust to engines that emit slashes.
  return formatted.replaceAll('/', '-');
}
