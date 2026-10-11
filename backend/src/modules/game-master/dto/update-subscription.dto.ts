import { Equals, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN } from '../../../common/utils/dates';

export class UpdateSubscriptionDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  endsOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Equals(true)
  cancel?: true;
}
