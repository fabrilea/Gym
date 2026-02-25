import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { BillingService } from './billing.service';
import { GetMonthlyStatusDto } from './dto/get-monthly-status.dto';
import { UpsertPaymentDto } from './dto/upsert-payment.dto';
import { CreatePlanPeriodDto } from './dto/create-plan-period.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, Roles } from '../../common/decorators/roles.decorator';

class ExportMonthlyStatusDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthKey debe tener formato YYYY-MM' })
  monthKey: string;

  @IsString()
  @IsOptional()
  name?: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('monthly-status')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: 'List monthly member status (plan + payment)' })
  findMonthlyStatus(@Query() query: GetMonthlyStatusDto) {
    return this.billingService.getMonthlyStatus(query);
  }

  @Post('payments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create or update member payment for a month [ADMIN]' })
  upsertPayment(@Body() dto: UpsertPaymentDto, @CurrentUser() actor: { id: string }) {
    return this.billingService.upsertPayment(dto, actor.id);
  }

  @Post('plan-periods')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create plan period (renew/history) [ADMIN]' })
  createPlanPeriod(@Body() dto: CreatePlanPeriodDto, @CurrentUser() actor: { id: string }) {
    return this.billingService.createPlanPeriod(dto, actor.id);
  }

  @Post('monthly-status/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exportar estado mensual [ADMIN]' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        monthKey: { type: 'string', example: '2026-02' },
      },
      required: ['monthKey'],
    },
  })
  exportMonthlyStatus(
    @Body() dto: ExportMonthlyStatusDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.billingService.exportMonthlyStatus(dto.monthKey, actor.id, dto.name);
  }
}
