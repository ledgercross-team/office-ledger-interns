import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
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
  ValidateIf,
} from 'class-validator';

export const FILEABLE_TYPES = [
  'create_user',
  'create_project',
  'add_to_project',
  'create_task',
  'assign_task',
  'add_and_assign',
] as const;
export type FileableType = (typeof FILEABLE_TYPES)[number];

const STATUSES = ['pending', 'approved', 'applied', 'rejected', 'cancelled', 'expired'] as const;
const NEEDS_PROJECT = ['add_to_project', 'create_task', 'assign_task', 'add_and_assign'];
const NEEDS_SUBJECT = ['add_to_project', 'assign_task', 'add_and_assign'];
const NEEDS_TASK = ['assign_task', 'add_and_assign'];

export class ListRequestsQueryDto {
  @IsOptional() @IsIn(['mine', 'decide']) scope?: 'mine' | 'decide';
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(40) type?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() requesterId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class FileRequestDto {
  @IsIn(FILEABLE_TYPES) type!: FileableType;

  @ValidateIf((o: FileRequestDto) => NEEDS_PROJECT.includes(o.type))
  @IsUUID()
  projectId?: string;

  @ValidateIf((o: FileRequestDto) => NEEDS_SUBJECT.includes(o.type))
  @IsUUID()
  subjectMemberId?: string;

  @ValidateIf((o: FileRequestDto) => NEEDS_TASK.includes(o.type))
  @IsUUID()
  taskId?: string;

  // create_user
  @ValidateIf((o: FileRequestDto) => o.type === 'create_user') @IsEmail() @MaxLength(254) email?: string;
  @ValidateIf((o: FileRequestDto) => o.type === 'create_user') @IsString() @MinLength(1) @MaxLength(120)
  fullName?: string;
  @ValidateIf((o: FileRequestDto) => o.type === 'create_user') @IsIn(['manager', 'employee'])
  role?: 'manager' | 'employee';

  // create_project
  @ValidateIf((o: FileRequestDto) => o.type === 'create_project') @IsString() @MinLength(1) @MaxLength(200)
  name?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) managerIds?: string[];

  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class DecideRequestDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class BulkRequestsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all', { each: true }) ids!: string[];
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value : undefined)) @IsString() @MaxLength(1000)
  reason?: string;
}
