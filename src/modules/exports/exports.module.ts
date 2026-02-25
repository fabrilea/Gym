import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportJob } from './entities/export-job.entity';
import { UsersModule } from '../users/users.module';
import { CheckinsModule } from '../checkins/checkins.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([ExportJob]), UsersModule, CheckinsModule, AuditModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
