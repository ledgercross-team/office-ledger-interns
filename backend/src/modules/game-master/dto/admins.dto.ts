import { IsBoolean, IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class UpdateAdminDto {
  @IsBoolean()
  isActive!: boolean;
}
