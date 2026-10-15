import 'reflect-metadata';
import { parseKey } from '../hrms/auth/mfa';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT: number;

  // The hrms_api login of the office_ledger_hrms database, never the owner.
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_ACCESS_TTL_SECONDS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number;

  @Transform(toBoolean)
  @IsBoolean()
  COOKIE_SECURE: boolean;

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  @Transform(toBoolean)
  @IsBoolean()
  TRUST_PROXY: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_GLOBAL_PER_MIN: number;

  // Only the dev seed script reads this; a production deployment does not need it.
  @IsOptional()
  @IsString()
  SEED_DEMO_PASSWORD?: string;

  // The scheduler inside the API (docs/hrms/RUNBOOK.md Phase 12). On unless set to false.
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  HRMS_JOBS_ENABLED?: boolean = true;

  // How emails leave the API: "log" writes them to the application log, "none" drops them.
  @IsOptional()
  @IsIn(['log', 'none'])
  MAIL_TRANSPORT?: string = 'log';

  // 32 bytes (64 hex characters or base64) that encrypt MFA secrets.
  @IsString()
  @IsNotEmpty()
  MFA_ENCRYPTION_KEY: string;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));

  if (
    validatedConfig.NODE_ENV === NodeEnvironment.Production &&
    validatedConfig.COOKIE_SECURE === false
  ) {
    messages.push('COOKIE_SECURE must be true when NODE_ENV is production');
  }

  try {
    parseKey(validatedConfig.MFA_ENCRYPTION_KEY);
  } catch (error) {
    messages.push(error instanceof Error ? error.message : 'MFA_ENCRYPTION_KEY is invalid');
  }

  if (messages.length > 0) {
    throw new Error(`Environment validation failed: ${messages.join('; ')}`);
  }

  return validatedConfig;
}
