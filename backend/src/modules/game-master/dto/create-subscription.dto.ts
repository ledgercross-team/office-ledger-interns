import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsAppDate } from '../../../common/validators/app-date';

export class CreateSubscriptionDto {
  @IsString()
  @Length(1, 60)
  planName!: string;

  @IsAppDate()
  startsOn!: string;

  @IsAppDate()
  endsOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
