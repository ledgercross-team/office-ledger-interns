import { IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN } from '../../../common/utils/dates';

export class CreateSubscriptionDto {
  @IsString()
  @Length(1, 60)
  planName!: string;

  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  startsOn!: string;

  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  endsOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
