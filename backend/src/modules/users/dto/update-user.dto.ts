import { IsBoolean, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

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

  // Employees only. A UUID reassigns them; null (admins only) leaves them unassigned.
  @IsOptional()
  @IsUUID()
  managerId?: string | null;
}
