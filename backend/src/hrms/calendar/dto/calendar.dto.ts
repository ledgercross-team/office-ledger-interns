import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CalendarQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['mine', 'team']) scope?: 'mine' | 'team';
  @IsOptional() @IsUUID() memberId?: string;
}

export class CreateMeetingDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @Matches(/^https?:\/\/\S+\.\S+/i, { message: 'meetingLink must be a valid http(s) URL' })
  @MaxLength(500)
  meetingLink?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300) location?: string | null;
  @IsOptional() @IsUUID() projectId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  inviteeIds!: string[];
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @Matches(/^https?:\/\/\S+\.\S+/i, { message: 'meetingLink must be a valid http(s) URL' })
  @MaxLength(500)
  meetingLink?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(300) location?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  inviteeIds?: string[];
}

export class RespondMeetingDto {
  @IsIn(['accepted', 'declined']) response!: 'accepted' | 'declined';
}
