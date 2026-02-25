import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MemberStatus } from '../entities/user.entity';

export const PLAN_OPTIONS = ['1_DIA', '2_DIAS', '3_DIAS', 'PASE_LIBRE'] as const;
export type PlanOption = (typeof PLAN_OPTIONS)[number];

export class CreateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dni?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: PLAN_OPTIONS })
  @IsOptional()
  @IsString()
  @IsIn(PLAN_OPTIONS)
  plan?: PlanOption;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  planExpiresAt?: string;

  @ApiPropertyOptional({ enum: MemberStatus, default: MemberStatus.ACTIVE })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;
}
