/** Identifies which form field needs attention, or null when the meeting is valid. */
export function meetingProblem(
  start: Date,
  end: Date,
  link: string | null,
): { field: 'start' | 'end' | 'place'; message: string } | null {
  if (Number.isNaN(start.getTime()))
    return { field: 'start', message: 'Enter a valid start time.' };
  if (Number.isNaN(end.getTime())) return { field: 'end', message: 'Enter a valid end time.' };
  if (end.getTime() <= start.getTime()) {
    return { field: 'end', message: 'End time must be after the start time.' };
  }
  if (start.getTime() < Date.now() - 5 * 60_000) {
    return { field: 'start', message: 'Choose a start time from now on.' };
  }
  if (end.getTime() - start.getTime() > 24 * 3_600_000) {
    return { field: 'end', message: 'A meeting cannot be longer than 24 hours.' };
  }
  if (link !== null && !/^https?:\/\/\S+\.\S+/i.test(link)) {
    return { field: 'place', message: 'Enter a web address starting with https://.' };
  }
  return null;
}
