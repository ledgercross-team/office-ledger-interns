import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['admin', 'manager', 'employee'])
  role?: 'admin' | 'manager' | 'employee';

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  // Employees reporting to this manager.
  @IsOptional()
  @IsUUID()
  managerId?: string;

  // Employees with no manager yet.
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unassigned?: boolean;
}
