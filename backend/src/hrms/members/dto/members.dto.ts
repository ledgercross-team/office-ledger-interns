import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ROLES = ['ceo', 'coo', 'manager', 'employee'] as const;
const STATUSES = ['active', 'suspended', 'deactivated'] as const;

export class ListMembersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsIn(ROLES) role?: (typeof ROLES)[number];
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class CreateMemberDto {
  @IsEmail() @MaxLength(254) email!: string;

  // Used only for a person who has no login yet; an existing login keeps its own name.
  @IsString() @MinLength(1) @MaxLength(120) fullName!: string;

  @IsIn(ROLES) role!: (typeof ROLES)[number];

  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
}

export class UpdateMemberDto {
  // Org-level profile fields: CEO, COO, a manager on a shared project, or the person.
  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;

  // Shared across every org the person belongs to: only the person may change these.
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) fullName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  // CEO and COO only.
  @IsOptional() @IsIn(ROLES) role?: (typeof ROLES)[number];
  @IsOptional() @IsBoolean() taskApprovalRequired?: boolean;
  @IsOptional() @IsBoolean() canViewAllProjects?: boolean;
}

export class SuspendMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds!: string[];
}
