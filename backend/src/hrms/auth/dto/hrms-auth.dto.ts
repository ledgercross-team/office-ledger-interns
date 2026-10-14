import { IsEmail, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';

export class HrmsLoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class HrmsSwitchOrgDto {
  @IsUUID()
  memberId!: string;
}

export class HrmsChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  // 10 to 128 characters, no other composition rules.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}

export class HrmsAcceptInviteDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class HrmsMfaEnrollDto {
  @IsString()
  @Length(20, 2000)
  mfaToken!: string;
}

export class HrmsMfaVerifyDto {
  @IsString()
  @Length(20, 2000)
  mfaToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
