import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Admins can add other admins; managers can only add employees (checked in the service).
  @IsIn(['admin', 'manager', 'employee'])
  role!: 'admin' | 'manager' | 'employee';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  // Employees only. Leave empty to assign later; otherwise choose an active manager.
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
