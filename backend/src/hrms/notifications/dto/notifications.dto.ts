import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ListNotificationsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unread?: boolean;
}

export class EmailPrefDto {
  @IsString() @MaxLength(64) kind!: string;
  @IsBoolean() muted!: boolean;
}

export class UpdateEmailPrefsDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => EmailPrefDto) prefs!: EmailPrefDto[];
}
