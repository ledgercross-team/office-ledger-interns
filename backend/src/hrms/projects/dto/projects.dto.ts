import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
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

const PROJECT_STATUSES = ['active', 'pending_lead_approval', 'completed', 'archived'] as const;

export class ListProjectsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: (typeof PROJECT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class CreateProjectDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsDateString({ strict: true }) startDate?: string;
  @IsOptional() @IsDateString({ strict: true }) dueDate?: string;

  // Managers added straight away (org member ids of managers).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  managerIds?: string[];
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsDateString({ strict: true }) startDate?: string;
  @IsOptional() @IsDateString({ strict: true }) dueDate?: string;
}

export class AddProjectMemberDto {
  @IsUUID() memberId!: string;
  @IsOptional() @IsBoolean() isLead?: boolean;
}

export class SetLeadDto {
  @IsBoolean() isLead!: boolean;
}

export class SendInviteDto {
  @IsUUID() memberId!: string;

  // The approved add_to_project / add_and_assign request, for a manager sending the invite.
  @IsOptional() @IsUUID() requestId?: string;
}

export class DeclineInviteDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class ReviewInviteDto {
  @IsIn(['accept', 'overrule']) decision!: 'accept' | 'overrule';

  // Required to overrule; the employee sees it.
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
