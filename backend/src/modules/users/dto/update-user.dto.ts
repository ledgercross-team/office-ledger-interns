import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
