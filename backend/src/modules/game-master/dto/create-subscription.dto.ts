import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/app-date';

export class CreateSubscriptionDto {
  @IsString()
  @Length(1, 60)
  planName!: string;

  @IsCalendarDate()
  startsOn!: string;

  @IsCalendarDate()
  endsOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
