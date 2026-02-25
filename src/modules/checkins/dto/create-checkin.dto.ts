import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCheckinDto {
  /**
   * Identify the member either by memberNumber OR userId.
   * At least one must be provided.
   */
  @ApiPropertyOptional({ example: '000123', description: 'Membership number (nro_socio)' })
  @IsOptional()
  @IsString()
  memberNumber?: string;

  @ApiPropertyOptional({ description: 'Member UUID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: '30123456', description: 'Member DNI' })
  @IsOptional()
  @IsString()
  dni?: string;

  @ApiPropertyOptional({ example: '2026-02-25T10:30:00Z', description: 'Defaults to now()' })
  @IsOptional()
  @IsDateString()
  checkinAt?: string;
}
