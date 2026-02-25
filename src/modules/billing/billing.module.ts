import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MemberPayment } from './entities/member-payment.entity';
import { MemberPlanPeriod } from './entities/member-plan-period.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { ExportJob } from '../exports/entities/export-job.entity';
import { Checkin } from '../checkins/entities/checkin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MemberPayment, MemberPlanPeriod, User, ExportJob, Checkin]),
    AuditModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
