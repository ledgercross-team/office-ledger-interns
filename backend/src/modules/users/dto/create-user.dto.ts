import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Only managers and employees can be created here; admins come with a company.
  @IsIn(['manager', 'employee'])
  role!: 'manager' | 'employee';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
