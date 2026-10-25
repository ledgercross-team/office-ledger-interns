import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateLeaveDto {
  @IsUUID() leaveTypeId!: string;
  @Matches(DATE, { message: 'startDate must look like 2026-03-15' }) startDate!: string;
  @Matches(DATE, { message: 'endDate must look like 2026-03-15' }) endDate!: string;
  @IsOptional() @IsBoolean() startHalfDay?: boolean;
  @IsOptional() @IsBoolean() endHalfDay?: boolean;
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class ListLeaveQueryDto {
  @IsOptional() @IsIn(['mine', 'team', 'decide']) scope?: 'mine' | 'team' | 'decide';
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value : undefined)) @IsString() @MaxLength(20)
  status?: string;
}
