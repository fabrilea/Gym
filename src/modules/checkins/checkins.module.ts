import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckinsController } from './checkins.controller';
import { CheckinsService } from './checkins.service';
import { Checkin } from './entities/checkin.entity';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Checkin]), UsersModule, AuditModule],
  controllers: [CheckinsController],
  providers: [CheckinsService],
  exports: [CheckinsService, TypeOrmModule],
})
export class CheckinsModule {}
