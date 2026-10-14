import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateOrgDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(40) planCode!: string;
  @IsEmail() @MaxLength(254) ceoEmail!: string;
  @IsString() @MinLength(1) @MaxLength(120) ceoFullName!: string;
}

export class BlockOrgDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}

export class SetPlanDto {
  @IsString() @MinLength(1) @MaxLength(40) planCode!: string;
  @IsOptional() @IsString() periodEnd?: string;
}

export class CreateGameMasterDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(120) fullName!: string;
}

export class RecoveryRequestDto {
  @IsUUID() targetMemberId!: string;
  @IsEmail() @MaxLength(254) newEmail!: string;
}

export class LastCeoRemovalDto {
  // The member who becomes CEO. The requesting CEO is deactivated when the gameMaster completes it.
  @IsUUID() replacementMemberId!: string;
}
