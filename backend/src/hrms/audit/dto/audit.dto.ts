import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListAuditQueryDto {
  @IsOptional()
  @IsString() // one table, or several separated by commas
  @Matches(/^[a-z_]{1,64}(,[a-z_]{1,64}){0,15}$/)
  table?: string;
  // The person who did it (an org member id).
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  @IsString()
  @MaxLength(20)
  action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class AddNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) note!: string;
}
