import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination';
import { TASK_CATEGORIES } from '../../../db/schema/enums';

const PRIORITIES = ['low', 'medium', 'high'] as const;
const STATUSES = ['todo', 'in_progress', 'delayed', 'done', 'incomplete', 'cancelled'] as const;
const ACTIONS = ['start', 'done', 'delayed', 'incomplete', 'reopen', 'cancel'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  category?: (typeof TASK_CATEGORIES)[number];

  @IsIn(PRIORITIES)
  priority!: (typeof PRIORITIES)[number];

  @IsISO8601()
  deadline!: string;

  @IsUUID()
  assigneeId!: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  category?: (typeof TASK_CATEGORIES)[number];

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsISO8601()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class ListTasksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  category?: (typeof TASK_CATEGORIES)[number];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsISO8601()
  dueBefore?: string;
}

export class StatusChangeDto {
  @IsIn(ACTIONS)
  action!: (typeof ACTIONS)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  comment?: string;
}

export class CommentDto {
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  body!: string;
}
