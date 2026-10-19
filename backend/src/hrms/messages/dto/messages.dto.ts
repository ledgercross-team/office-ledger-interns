import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RecipientsQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['ceo', 'coo', 'manager', 'employee', 'gameMaster']) role?: string;
}

export class StartThreadDto {
  @IsUUID() toUserId!: string;
  @Transform(trim) @IsString() @Length(1, 4000) body!: string;
}

export class GmStartThreadDto extends StartThreadDto {
  @IsUUID() orgId!: string;
}

export class ReplyDto {
  @Transform(trim) @IsString() @Length(1, 4000) body!: string;
}

export class FileReportDto {
  @IsUUID() ceoUserId!: string;
  @Transform(trim) @IsString() @Length(1, 200) subject!: string;
  @Transform(trim) @IsString() @Length(1, 4000) body!: string;
  @IsBoolean() anonymous!: boolean;
}
