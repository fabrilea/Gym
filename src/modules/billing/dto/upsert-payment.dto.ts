import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertPaymentDto {
  @ApiProperty({ description: 'Member UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: '2026-02', description: 'Payment month (YYYY-MM)' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthKey debe tener formato YYYY-MM' })
  monthKey: string;

  @ApiProperty({ example: 12000, description: 'Monthly amount due' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountDue: number;

  @ApiPropertyOptional({ example: 12000, description: 'Amount paid so far' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid?: number;

  @ApiPropertyOptional({ example: '2026-02-10T15:00:00Z' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ example: 'CASH', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  method?: string;

  @ApiPropertyOptional({ example: 'REC-0001', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
