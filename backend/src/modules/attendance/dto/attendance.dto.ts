import {
  IsDateString,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { DATE_PATTERN } from '../../../common/utils/dates';

export class MyAttendanceQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  to?: string;
}

export class TeamAttendanceQueryDto extends MyAttendanceQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  date?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
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
