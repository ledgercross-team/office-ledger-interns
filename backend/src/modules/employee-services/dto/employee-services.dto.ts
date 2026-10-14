import { Transform } from 'class-transformer';
import { IsAppDate } from '../../../common/validators/app-date';
import { IsIn, IsString, Length } from 'class-validator';

const LEAVE_TYPES = ['annual', 'sick', 'personal', 'emergency'] as const;
const COMPLAINT_CATEGORIES = ['workplace', 'facilities', 'payroll', 'harassment', 'other'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateLeaveRequestDto {
  @IsIn(LEAVE_TYPES)
  leaveType!: (typeof LEAVE_TYPES)[number];

  @IsAppDate()
  startOn!: string;

  @IsAppDate()
  endOn!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  reason!: string;
}

export class CreateComplaintDto {
  @IsIn(COMPLAINT_CATEGORIES)
  category!: (typeof COMPLAINT_CATEGORIES)[number];

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  subject!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  details!: string;
}
