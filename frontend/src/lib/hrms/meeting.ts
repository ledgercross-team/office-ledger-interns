/** Says what is illogical about the dates and link, or null when they make sense. */
export function meetingProblem(start: Date, end: Date, link: string | null): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Enter a valid start and end date and time.';
  }
  if (end.getTime() <= start.getTime())
    return 'The meeting must end after it starts. Check the end date and time.';
  if (start.getTime() < Date.now() - 5 * 60_000)
    return 'The start time is in the past. Choose a time from now on.';
  if (end.getTime() - start.getTime() > 24 * 3_600_000) {
    return 'A meeting cannot be longer than 24 hours. Check the start and end dates.';
  }
  if (link !== null && !/^https?:\/\/\S+\.\S+/i.test(link)) {
    return 'The meeting link must be a web address starting with https://';
  }
  return null;
}
