import { Transform, Type } from 'class-transformer';
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

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'] as const;
export const TASK_URGENCIES = ['high', 'medium', 'low'] as const;

export class ListTasksQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() mine?: boolean;
  @IsOptional() @IsIn(TASK_STATUSES) status?: (typeof TASK_STATUSES)[number];
  @IsOptional() @IsIn(TASK_URGENCIES) urgency?: (typeof TASK_URGENCIES)[number];
  // Hide Done and Cancelled.
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() open?: boolean;
  @IsOptional() @IsIn(['overdue', 'no_assignee', 'no_manager', 'no_employee']) flag?:
    | 'overdue'
    | 'no_assignee'
    | 'no_manager'
    | 'no_employee';
}

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsIn(TASK_URGENCIES) urgency!: (typeof TASK_URGENCIES)[number];
  @IsDateString() dueAt!: string;

  // Org member ids of people already on the project. A task may start with nobody.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];

  // The approved create_task request, for a manager whose approval switch is on.
  @IsOptional() @IsUUID() requestId?: string;
  // The approved assign_task request, for assignees of such a manager.
  @IsOptional() @IsUUID() assignRequestId?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(TASK_URGENCIES) urgency?: (typeof TASK_URGENCIES)[number];
  @IsOptional() @IsDateString() dueAt?: string;
}

export class ChangeTaskStatusDto {
  @IsIn(TASK_STATUSES) status!: (typeof TASK_STATUSES)[number];

  // Sending a task back and reopening it need a comment.
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;

  // Blocking and cancelling need a reason.
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class AddAssigneeDto {
  @IsUUID() memberId!: string;
  @IsOptional() @IsUUID() requestId?: string;
}
