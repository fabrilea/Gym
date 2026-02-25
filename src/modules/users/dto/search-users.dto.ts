import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SearchUsersDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by membership number (partial match)' })
  @IsOptional()
  @IsString()
  memberNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by DNI (partial match)' })
  @IsOptional()
  @IsString()
  dni?: string;

  @ApiPropertyOptional({ description: 'Filter by name (first or last, partial match)' })
  @IsOptional()
  @IsString()
  name?: string;
}
