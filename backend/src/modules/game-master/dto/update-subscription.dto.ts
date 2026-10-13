import { Equals, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/app-date';

// Every field is optional: send only what changes.
export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  planName?: string;

  @IsOptional()
  @IsCalendarDate()
  startsOn?: string;

  @IsOptional()
  @IsCalendarDate()
  endsOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Equals(true)
  cancel?: true;
}
