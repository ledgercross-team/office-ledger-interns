import { IsEmail, IsISO8601, IsString, Length, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN } from '../../../common/utils/dates';

export const WORK_START_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateCompanyDto {
  @IsString()
  @Length(1, 120)
  companyName!: string;

  @IsString()
  @MaxLength(64)
  timezone!: string;

  @Matches(WORK_START_PATTERN, { message: 'workStartTime must be HH:mm' })
  workStartTime!: string;

  @IsString()
  @Length(1, 120)
  adminFullName!: string;

  @IsEmail()
  @MaxLength(254)
  adminEmail!: string;

  @IsString()
  @Length(1, 60)
  planName!: string;

  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  startsOn!: string;

  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  endsOn!: string;
}
