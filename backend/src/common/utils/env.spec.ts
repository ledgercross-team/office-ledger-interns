import { isEnabled } from './env';

describe('isEnabled', () => {
  it('is on for true and "true"', () => {
    expect(isEnabled(true)).toBe(true);
    expect(isEnabled('true')).toBe(true);
  });

  it('is off for everything else', () => {
    for (const value of [false, 'false', '', undefined, null, 1, 'TRUE']) {
      expect(isEnabled(value)).toBe(false);
    }
  });
});
