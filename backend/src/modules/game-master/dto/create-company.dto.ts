import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { IsAppDate } from '../../../common/validators/app-date';

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

  @IsAppDate()
  startsOn!: string;

  @IsAppDate()
  endsOn!: string;
}
