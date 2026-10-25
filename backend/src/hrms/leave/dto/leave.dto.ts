import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLeaveDto {
  @IsUUID() leaveTypeId!: string;
  @IsDateString({ strict: true }, { message: 'Enter a valid start date.' }) startDate!: string;
  @IsDateString({ strict: true }, { message: 'Enter a valid end date.' }) endDate!: string;
  @IsOptional() @IsBoolean() startHalfDay?: boolean;
  @IsOptional() @IsBoolean() endHalfDay?: boolean;
  @IsString() @Matches(/\S/, { message: 'Enter a reason.' }) @MaxLength(1000) reason!: string;
}

export class ListLeaveQueryDto {
  @IsOptional() @IsIn(['mine', 'team', 'decide']) scope?: 'mine' | 'team' | 'decide';
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  @IsString()
  @MaxLength(20)
  status?: string;
}
