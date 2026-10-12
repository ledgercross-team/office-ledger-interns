import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { IsAppDate } from '../../../common/validators/app-date';

export class MyAttendanceQueryDto {
  @IsOptional()
  @IsAppDate()
  from?: string;

  @IsOptional()
  @IsAppDate()
  to?: string;
}

export class TeamAttendanceQueryDto extends MyAttendanceQueryDto {
  @IsOptional()
  @IsAppDate()
  date?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class StatsQueryDto {
  // Look-back window in days; defaults to 30.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;

  // A calendar month in the company's timezone, for example 2026-10.
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must use YYYY-MM format.',
  })
  month?: string;
}

export class CorrectAttendanceDto {
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @IsString()
  @Length(1, 500)
  note!: string;
}
