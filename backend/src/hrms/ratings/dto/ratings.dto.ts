import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RatingItemDto {
  @IsUUID() rateeId!: string;
  @IsInt() @Min(1) @Max(5) stars!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class SubmitRatingsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RatingItemDto)
  ratings!: RatingItemDto[];
}
