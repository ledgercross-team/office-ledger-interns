import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface MappedError {
  status: number;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

interface PgError {
  code?: string;
  message?: string;
  constraint?: string;
  cause?: unknown;
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

// drizzle wraps the driver error in a DrizzleQueryError whose `cause` is the pg error.
function findPgError(error: unknown): PgError | null {
  let value: unknown = error;
  for (let depth = 0; depth < 5 && value && typeof value === 'object'; depth += 1) {
    const candidate = value as PgError;
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    value = candidate.cause;
  }
  return null;
}

/**
 * What is safe to write to the log. drizzle's error text contains the whole statement and its
 * parameters (a password hash, a one-time token, a person's data), so only the database's own
 * code, message and constraint name are used for database errors.
 */
export function describeError(error: unknown): string {
  const pg = findPgError(error);
  if (pg?.code) {
    return `database error ${pg.code}: ${pg.message ?? 'no message'}${pg.constraint ? ` (${pg.constraint})` : ''}`;
  }
  if (error instanceof Error) {
    return error.message.startsWith('Failed query')
      ? 'database query failed'
      : `${error.name}: ${error.message}`.slice(0, 500);
  }
  return 'unknown error';
}

/** Maps a database error to an HTTP status. Returns null when it is not a database error. */
export function mapDatabaseError(error: unknown): MappedError | null {
  const pg = findPgError(error);
  if (!pg?.code) return null;

  switch (pg.code) {
    case 'P0001': // a rule written for people: show it as is
      return { status: HttpStatus.CONFLICT, message: pg.message ?? GENERIC_MESSAGE, code: 'RULE' };
    case '23514':
      if (pg.constraint === 'org_settings_weights_check') {
        const message = 'Performance score weights must total exactly 100%.';
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          message,
          code: pg.constraint,
          errors: Object.fromEntries(
            ['weightAttendance', 'weightRating', 'weightOntime', 'weightLeave'].map((field) => [
              field,
              [message],
            ]),
          ),
        };
      }
      if (pg.constraint === 'org_settings_check') {
        const message = 'Red workload thresholds must be greater than the amber thresholds.';
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          message,
          code: pg.constraint,
          errors: {
            workloadRedTasks: [message],
            workloadRedProjects: [message],
          },
        };
      }
      // A trigger can RAISE with check_violation (the seat limit does): there is no
      // constraint name, and the message was written for people. A real CHECK constraint
      // has a name and gets the generic message.
      if (!pg.constraint) {
        return {
          status: HttpStatus.CONFLICT,
          message: pg.message ?? GENERIC_MESSAGE,
          code: 'RULE',
        };
      }
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'A value is not allowed.',
        code: pg.constraint,
      };
    case '23505':
      if (pg.constraint === 'org_holidays_pkey') {
        const message = 'A holiday already exists on this date.';
        return {
          status: HttpStatus.CONFLICT,
          message,
          code: 'DUPLICATE',
          errors: { date: [message] },
        };
      }
      if (pg.constraint === 'org_office_networks_org_id_network_key') {
        const message = 'This office network is already listed.';
        return {
          status: HttpStatus.CONFLICT,
          message,
          code: 'DUPLICATE',
          errors: { network: [message] },
        };
      }
      return { status: HttpStatus.CONFLICT, message: 'This already exists.', code: 'DUPLICATE' };
    case '23503':
      return {
        status: HttpStatus.CONFLICT,
        message: 'This refers to something that does not exist.',
        code: 'MISSING_REFERENCE',
      };
    case '42501':
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'You are not allowed to do this.',
        code: 'NOT_ALLOWED',
      };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: GENERIC_MESSAGE };
  }
}

// Applied to every controller through HrmsController.
@Catch()
export class HrmsErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HrmsErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(
          typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body,
        );
      return;
    }

    const mapped = mapDatabaseError(exception);
    if (!mapped || mapped.status >= 500) {
      // Log the cause, never send it.
      this.logger.error(describeError(exception));
    }

    const status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      statusCode: status,
      message: mapped?.message ?? GENERIC_MESSAGE,
      ...(mapped?.code ? { code: mapped.code } : {}),
      ...(mapped?.errors ? { errors: mapped.errors } : {}),
    });
  }
}
