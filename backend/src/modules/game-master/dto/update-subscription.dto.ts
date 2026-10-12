import { Equals, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsAppDate } from '../../../common/validators/app-date';

// Every field is optional: send only what changes.
export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  planName?: string;

  @IsOptional()
  @IsAppDate()
  startsOn?: string;

  @IsOptional()
  @IsAppDate()
  endsOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Equals(true)
  cancel?: true;
}
