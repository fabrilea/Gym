import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Between, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import {
  MemberPayment,
  PaymentStatus,
} from './entities/member-payment.entity';
import {
  MemberPlanPeriod,
  PlanPeriodStatus,
} from './entities/member-plan-period.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { GetMonthlyStatusDto } from './dto/get-monthly-status.dto';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';
import { UpsertPaymentDto } from './dto/upsert-payment.dto';
import { CreatePlanPeriodDto } from './dto/create-plan-period.dto';
import { ExportJob } from '../exports/entities/export-job.entity';
import { ExportJobResponseDto } from '../exports/dto/export-job-response.dto';

export interface MonthlyStatusRow {
  userId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dni: string | null;
  memberStatus: string;
  monthKey: string;
  paymentViewStatus: 'ACTIVE' | 'INACTIVE';
  planName: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
  planStatus: PlanPeriodStatus | null;
  amountDue: number;
  amountPaid: number;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  hasPaid: boolean;
  lastCheckinAt: string | null;
  week1Checkins: number;
  week2Checkins: number;
  week3Checkins: number;
  week4Checkins: number;
  week5Checkins: number;
  totalCheckins: number;
}

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(MemberPayment)
    private readonly paymentRepo: Repository<MemberPayment>,
    @InjectRepository(MemberPlanPeriod)
    private readonly planPeriodRepo: Repository<MemberPlanPeriod>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Checkin)
    private readonly checkinRepo: Repository<Checkin>,
    @InjectRepository(ExportJob)
    private readonly exportJobRepo: Repository<ExportJob>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async getMonthlyStatus(dto: GetMonthlyStatusDto): Promise<PaginatedResult<MonthlyStatusRow>> {
    const { page = 1, limit = 20 } = dto;

    const qb = this.userRepo.createQueryBuilder('u').where('u.deletedAt IS NULL');

    if (dto.memberNumber) {
      qb.andWhere('u.memberNumber ILIKE :memberNumber', {
        memberNumber: `%${dto.memberNumber}%`,
      });
    }

    if (dto.name) {
      qb.andWhere(
        "(u.firstName ILIKE :name OR u.lastName ILIKE :name OR CONCAT(u.firstName, ' ', u.lastName) ILIKE :name)",
        { name: `%${dto.name}%` },
      );
    }

    const [users, total] = await qb
      .orderBy('u.memberNumber', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const rows = await this.mapUsersToMonthlyRows(users, dto.monthKey);

    return paginate(rows, total, page, limit);
  }

  async upsertPayment(dto: UpsertPaymentDto, actorId: string): Promise<MemberPayment> {
    await this.ensureUserExists(dto.userId);

    const amountDue = this.toMoneyValue(dto.amountDue);
    const amountPaid = this.toMoneyValue(dto.amountPaid ?? 0);

    let payment = await this.paymentRepo.findOne({
      where: { userId: dto.userId, monthKey: dto.monthKey },
    });

    const before = payment ? { ...payment } : null;

    if (!payment) {
      payment = this.paymentRepo.create({
        userId: dto.userId,
        monthKey: dto.monthKey,
        amountDue,
        amountPaid,
      });
    }

    payment.amountDue = amountDue;
    payment.amountPaid = amountPaid;
    payment.status = this.resolvePaymentStatus(Number(amountDue), Number(amountPaid));
    payment.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    payment.method = dto.method ?? null;
    payment.reference = dto.reference ?? null;

    const saved = await this.paymentRepo.save(payment);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'PAYMENT_UPSERT',
      entity: 'MemberPayment',
      entityId: saved.id,
      beforeJson: before,
      afterJson: saved,
    });

    return saved;
  }

  async createPlanPeriod(dto: CreatePlanPeriodDto, actorId: string): Promise<MemberPlanPeriod> {
    await this.ensureUserExists(dto.userId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Las fechas del período de plan son inválidas');
    }

    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('startDate debe ser menor o igual a endDate');
    }

    const period = this.planPeriodRepo.create({
      userId: dto.userId,
      planName: dto.planName,
      startDate,
      endDate,
      status: dto.status ?? PlanPeriodStatus.ACTIVE,
    });

    const saved = await this.planPeriodRepo.save(period);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'PLAN_PERIOD_CREATE',
      entity: 'MemberPlanPeriod',
      entityId: saved.id,
      afterJson: saved,
    });

    return saved;
  }

  async exportMonthlyStatus(monthKey: string, actorId: string, name?: string): Promise<ExportJobResponseDto> {
    const usersQb = this.userRepo
      .createQueryBuilder('u')
      .where('u.deletedAt IS NULL');

    const normalizedName = (name ?? '').trim();
    if (normalizedName) {
      usersQb.andWhere(
        "(u.firstName ILIKE :name OR u.lastName ILIKE :name OR CONCAT(u.firstName, ' ', u.lastName) ILIKE :name)",
        { name: `%${normalizedName}%` },
      );
    }

    const users = await usersQb.orderBy('u.memberNumber', 'ASC').getMany();

    const rows = await this.mapUsersToMonthlyRows(users, monthKey);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GymAPI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('MonthlyStatus');
    sheet.columns = [
      { header: 'N° socio', key: 'memberNumber', width: 14 },
      { header: 'Nombre', key: 'fullName', width: 28 },
      { header: 'DNI', key: 'dni', width: 14 },
      { header: 'Pago', key: 'paymentLabel', width: 12 },
      { header: 'Plan', key: 'plan', width: 16 },
      { header: 'Último pago', key: 'lastPayment', width: 14 },
      { header: 'Mes pagado', key: 'monthKey', width: 12 },
      { header: 'Vence', key: 'planExpiresAt', width: 14 },
      { header: 'Días restantes', key: 'daysRemaining', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAD3' },
    };

    for (const row of rows) {
      const planExpiresAt = row.planEndDate ?? '-';
      sheet.addRow({
        memberNumber: row.memberNumber,
        fullName: `${row.firstName} ${row.lastName}`.trim(),
        dni: row.dni ?? '-',
        paymentLabel: row.paymentStatus === PaymentStatus.PAID ? 'PAGO' : 'NO PAGO',
        plan: (row.planName ?? '-').replace(/_/g, ' '),
        lastPayment: row.paidAt ? row.paidAt.slice(0, 10) : '-',
        monthKey: row.monthKey,
        planExpiresAt,
        daysRemaining: this.formatDaysRemaining(planExpiresAt === '-' ? null : planExpiresAt),
      });
    }

    const storagePath = this.configService.get<string>('storage.path', './storage');
    const exportDir = path.join(storagePath, 'exports', 'monthly-status', monthKey);
    fs.mkdirSync(exportDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `monthly_status_${monthKey}_${timestamp}.xlsx`;
    const filePath = path.join(exportDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    const fileBuffer = fs.readFileSync(filePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const job = this.exportJobRepo.create({
      monthKey,
      generatedByUserId: actorId,
      filePath: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
      fileHash,
    });
    const savedJob = await this.exportJobRepo.save(job);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'EXPORT_MONTHLY_STATUS',
      entity: 'ExportJob',
      entityId: savedJob.id,
      afterJson: { monthKey, fileName, fileHash },
    });

    return {
      id: savedJob.id,
      monthKey: savedJob.monthKey,
      createdAt: savedJob.createdAt,
      downloadUrl: `/api/v1/exports/${savedJob.id}/download`,
    };
  }

  private async mapUsersToMonthlyRows(users: User[], monthKey: string): Promise<MonthlyStatusRow[]> {
    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) {
      return [];
    }

    const { monthStart, monthEnd } = this.getMonthBoundaries(monthKey);
    const monthStartDate = new Date(`${monthStart}T00:00:00.000Z`);
    const monthEndDate = new Date(`${monthEnd}T23:59:59.999Z`);

    const payments = await this.paymentRepo.find({
      where: { userId: In(userIds), monthKey },
    });

    const paymentMap = new Map(payments.map((payment) => [payment.userId, payment]));

    const planPeriods = await this.planPeriodRepo
      .createQueryBuilder('pp')
      .where('pp.userId IN (:...userIds)', { userIds })
      .andWhere('pp.startDate <= :monthEnd', { monthEnd })
      .andWhere('pp.endDate >= :monthStart', { monthStart })
      .orderBy('pp.userId', 'ASC')
      .addOrderBy('pp.startDate', 'DESC')
      .getMany();

    const monthCheckins = await this.checkinRepo.find({
      where: {
        userId: In(userIds),
        checkinAt: Between(monthStartDate, monthEndDate),
      },
      order: { checkinAt: 'ASC' },
    });

    const checkinsByUser = new Map<string, Checkin[]>();
    for (const checkin of monthCheckins) {
      const current = checkinsByUser.get(checkin.userId) ?? [];
      current.push(checkin);
      checkinsByUser.set(checkin.userId, current);
    }

    const latestPlanByUser = new Map<string, MemberPlanPeriod>();
    for (const period of planPeriods) {
      if (!latestPlanByUser.has(period.userId)) {
        latestPlanByUser.set(period.userId, period);
      }
    }

    return users.map((user) => {
      const payment = paymentMap.get(user.id);
      const period = latestPlanByUser.get(user.id);

      const amountDue = payment ? Number(payment.amountDue) : 0;
      const amountPaid = payment ? Number(payment.amountPaid) : 0;
      const paymentStatus = payment
        ? payment.status
        : this.resolvePaymentStatus(amountDue, amountPaid);
      const hasPaid = amountPaid > 0;
      const paymentViewStatus: 'ACTIVE' | 'INACTIVE' = hasPaid ? 'ACTIVE' : 'INACTIVE';

      const userCheckins = checkinsByUser.get(user.id) ?? [];
      const weekCounts = [0, 0, 0, 0, 0];
      for (const checkin of userCheckins) {
        const dayOfMonth = new Date(checkin.checkinAt).getUTCDate();
        const weekIndex = Math.min(4, Math.floor((dayOfMonth - 1) / 7));
        weekCounts[weekIndex] += 1;
      }

      const lastCheckinAt =
        userCheckins.length > 0 ? userCheckins[userCheckins.length - 1].checkinAt.toISOString() : null;

      return {
        userId: user.id,
        memberNumber: user.memberNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        dni: user.dni,
        memberStatus: user.status,
        monthKey,
        paymentViewStatus,
        planName: period?.planName ?? user.plan ?? null,
        planStartDate: period ? this.formatDate(period.startDate) : null,
        planEndDate: period ? this.formatDate(period.endDate) : this.formatDate(user.planExpiresAt),
        planStatus: period?.status ?? null,
        amountDue,
        amountPaid,
        paymentStatus,
        paidAt: payment?.paidAt ? payment.paidAt.toISOString() : null,
        hasPaid,
        lastCheckinAt,
        week1Checkins: weekCounts[0],
        week2Checkins: weekCounts[1],
        week3Checkins: weekCounts[2],
        week4Checkins: weekCounts[3],
        week5Checkins: weekCounts[4],
        totalCheckins: userCheckins.length,
      };
    });
  }

  private toMoneyValue(value: number): string {
    return Number(value).toFixed(2);
  }

  private resolvePaymentStatus(amountDue: number, amountPaid: number): PaymentStatus {
    if (amountPaid <= 0) {
      return PaymentStatus.UNPAID;
    }

    if (amountDue > 0 && amountPaid < amountDue) {
      return PaymentStatus.PARTIAL;
    }

    return PaymentStatus.PAID;
  }

  private getMonthBoundaries(monthKey: string): { monthStart: string; monthEnd: string } {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('monthKey debe tener formato YYYY-MM');
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));

    return {
      monthStart: monthStart.toISOString().split('T')[0],
      monthEnd: monthEnd.toISOString().split('T')[0],
    };
  }

  private formatDate(date: Date | null): string | null {
    return date ? new Date(date).toISOString().split('T')[0] : null;
  }

  private formatDaysRemaining(expirationDate: string | null): string {
    if (!expirationDate) return '-';
    const days = this.calculateDaysRemaining(expirationDate);
    if (days > 0) return `${days} días`;
    if (days === 0) return 'Vence hoy';
    return `Vencido (${Math.abs(days)}d)`;
  }

  private calculateDaysRemaining(expirationDate: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(expirationDate.slice(0, 10));
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - today.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`No se encontró el socio ${userId}`);
    }
  }
}
