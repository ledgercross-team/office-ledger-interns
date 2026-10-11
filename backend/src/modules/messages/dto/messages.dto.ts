import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class SendMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export class ListMessagesQueryDto {
  // createdAt of the oldest message already loaded; returns older ones.
  @IsOptional()
  @IsISO8601()
  before?: string;
}
