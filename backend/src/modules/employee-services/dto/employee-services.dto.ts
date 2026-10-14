import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

const COMPLAINT_CATEGORIES = ['workplace', 'facilities', 'payroll', 'harassment', 'other'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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
