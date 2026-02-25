import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class GetMonthlyStatusDto extends PaginationDto {
  @ApiProperty({ example: '2026-02', description: 'Month to query (YYYY-MM)' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthKey debe tener formato YYYY-MM' })
  monthKey: string;

  @ApiPropertyOptional({ description: 'Filter by membership number (partial match)' })
  @IsOptional()
  @IsString()
  memberNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by name (first or last, partial match)' })
  @IsOptional()
  @IsString()
  name?: string;
}
