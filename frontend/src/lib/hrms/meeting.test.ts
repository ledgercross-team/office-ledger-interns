import { describe, expect, it } from 'vitest';
import { meetingProblem } from './meeting';

const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000);

describe('meetingProblem', () => {
  it('accepts a sensible meeting', () => {
    expect(meetingProblem(at(1), at(2), 'https://meet.example.com/abc')).toBeNull();
    expect(meetingProblem(at(1), at(2), null)).toBeNull();
  });
  it('says when the end is not after the start', () => {
    expect(meetingProblem(at(2), at(1), null)).toMatch(/must end after it starts/);
    expect(meetingProblem(at(2), at(2), null)).toMatch(/must end after it starts/);
  });
  it('says when the start is in the past', () => {
    expect(meetingProblem(at(-3), at(-2), null)).toMatch(/in the past/);
  });
  it('says when it runs longer than a day', () => {
    expect(meetingProblem(at(1), at(30), null)).toMatch(/longer than 24 hours/);
  });
  it('says when a date is missing or invalid', () => {
    expect(meetingProblem(new Date('nope'), at(2), null)).toMatch(/valid start and end/);
  });
  it('says when the online link is not a web address', () => {
    expect(meetingProblem(at(1), at(2), 'room 4')).toMatch(/web address/);
  });
});
