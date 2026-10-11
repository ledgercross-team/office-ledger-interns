import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination';

export class ListUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['manager', 'employee'])
  role?: 'manager' | 'employee';

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
