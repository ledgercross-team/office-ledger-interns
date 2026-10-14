import { IsString, MaxLength, MinLength } from 'class-validator';

// 10 to 128 characters, no other composition rules (section 9.6). The
// "must not equal the email" rule needs the user and is checked in the service.
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
