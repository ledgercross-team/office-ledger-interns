import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { WORK_START_PATTERN } from './create-company.dto';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @Matches(WORK_START_PATTERN, { message: 'workStartTime must be HH:mm' })
  workStartTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
