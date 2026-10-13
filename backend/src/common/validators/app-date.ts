import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches, ValidateBy } from 'class-validator';
import { DATE_PATTERN, isSupportedDate, MAX_DATE, MIN_DATE } from '../utils/dates';

/** A YYYY-MM-DD calendar date between 2024-01-01 and 2050-12-31. */
export function IsAppDate() {
  return applyDecorators(
    Matches(DATE_PATTERN, { message: 'date must be formatted YYYY-MM-DD' }),
    IsISO8601({ strict: true }),
    ValidateBy({
      name: 'isSupportedDate',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isSupportedDate(value),
        defaultMessage: () => `date must be between ${MIN_DATE} and ${MAX_DATE}`,
      },
    }),
  );
}

/** A valid YYYY-MM-DD calendar date without the app-wide reporting window. */
export function IsCalendarDate() {
  return applyDecorators(
    Matches(DATE_PATTERN, { message: 'date must be formatted YYYY-MM-DD' }),
    IsISO8601({ strict: true }),
  );
}
