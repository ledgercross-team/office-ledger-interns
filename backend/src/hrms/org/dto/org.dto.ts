import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateOrgSettingsDto {
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'workStartTime must be HH:MM' })
  workStartTime?: string;

  @IsOptional() @IsInt() @Min(0) @Max(240) lateGraceMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekendDays?: number[];

  @IsOptional() @IsInt() @Min(1) @Max(30) requestExpiryWorkingDays?: number;

  @IsOptional() @IsInt() @Min(1) @Max(1000) workloadAmberTasks?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) workloadAmberProjects?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) workloadRedTasks?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) workloadRedProjects?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100) weightAttendance?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) weightRating?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) weightOntime?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) weightLeave?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1) pointsLate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1) pointsMissingCheckout?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1) pointsUnpaidLeave?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50) ratingMinCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50) ratingPriorWeight?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) ratingWindowDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(240) highUrgencyReminderHours?: number;
}

export class CreateOfficeNetworkDto {
  // An IPv4/IPv6 address or CIDR range. Postgres does the final validation (cidr).
  @IsString()
  @Matches(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, {
    message: 'network must be an IP address or CIDR range',
  })
  @MaxLength(60)
  network!: string;

  @IsOptional() @IsString() @MaxLength(100) label?: string;
}

export class CreateHolidayDto {
  @IsDateString({ strict: true })
  date!: string;

  @IsString() @MinLength(1) @MaxLength(100) name!: string;
}

export class CreateLeaveTypeDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,29}$/, { message: 'code must be lowercase letters, digits and _' })
  code!: string;

  @IsString() @MinLength(1) @MaxLength(60) name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(366)
  yearlyAllowanceDays!: number;

  @IsBoolean() isPaid!: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(366)
  yearlyAllowanceDays?: number;

  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
