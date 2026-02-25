import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PlanPeriodStatus } from '../entities/member-plan-period.entity';

export class CreatePlanPeriodDto {
  @ApiProperty({ description: 'Member UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'Mensual', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  planName: string;

  @ApiProperty({ example: '2026-02-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-02-29' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: PlanPeriodStatus, default: PlanPeriodStatus.ACTIVE })
  @IsOptional()
  @IsEnum(PlanPeriodStatus)
  status?: PlanPeriodStatus;
}
