import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MonthQueryDto {
  @IsOptional() @Matches(MONTH, { message: 'month must look like 2026-03' }) month?: string;
}

export class TeamAttendanceQueryDto {
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @Matches(MONTH, { message: 'month must look like 2026-03' }) month?: string;
  // One day across the team, used when memberId is left out.
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must look like 2026-03-15' }) date?: string;
}

export class FileCorrectionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'workDate must look like 2026-03-15' }) workDate!: string;
  @IsOptional() @IsDateString() checkInAt?: string;
  @IsOptional() @IsDateString() checkOutAt?: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
