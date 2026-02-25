import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Checkin } from './entities/checkin.entity';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { FilterCheckinsDto } from './dto/filter-checkins.dto';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class CheckinsService {
  constructor(
    @InjectRepository(Checkin)
    private readonly checkinRepo: Repository<Checkin>,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  // ── Create check-in ────────────────────────────────────────────────────────
  async create(dto: CreateCheckinDto, actorId: string): Promise<Checkin> {
    if (!dto.memberNumber && !dto.userId && !dto.dni) {
      throw new BadRequestException('Debes enviar memberNumber, dni o userId');
    }

    // Resolve member
    const user = dto.userId
      ? await this.usersService.findOne(dto.userId)
      : dto.dni
        ? await this.usersService.findByDni(dto.dni)
        : await this.usersService.findByMemberNumber(dto.memberNumber);

    if (!user) {
      throw new NotFoundException(`No se encontró el socio "${dto.memberNumber ?? dto.dni ?? dto.userId}"`);
    }

    const checkinDate = dto.checkinAt ? new Date(dto.checkinAt) : new Date();

    const weeklyLimit = getWeeklyLimitByPlan(user.plan);
    if (weeklyLimit !== null) {
      const { weekStart, weekEnd } = getWeekRangeUtc(checkinDate);
      const weeklyCount = await this.checkinRepo.count({
        where: {
          userId: user.id,
          checkinAt: Between(weekStart, weekEnd),
        },
      });

      if (weeklyCount >= weeklyLimit) {
        throw new BadRequestException(
          `Se alcanzó el límite semanal de asistencias para el plan ${user.plan ?? 'N/D'} (${weeklyLimit})`,
        );
      }
    }

    const checkin = this.checkinRepo.create({
      userId: user.id,
      checkinAt: checkinDate,
      createdByUserId: actorId,
    });

    const saved = await this.checkinRepo.save(checkin);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'CHECKIN_CREATE',
      entity: 'Checkin',
      entityId: saved.id,
      afterJson: { userId: saved.userId, checkinAt: saved.checkinAt },
    });

    return saved;
  }

  async createPublicByDni(dni: string): Promise<{ ok: true; message: string; checkinId: string }> {
    const normalizedDni = (dni ?? '').trim();
    if (!normalizedDni) {
      throw new BadRequestException('El DNI es obligatorio');
    }

    const checkin = await this.create({ dni: normalizedDni }, 'SYSTEM');
    return {
      ok: true,
      message: 'Ingreso registrado',
      checkinId: checkin.id,
    };
  }

  // ── List by date ───────────────────────────────────────────────────────────
  async findByDate(filter: FilterCheckinsDto): Promise<PaginatedResult<Checkin>> {
    const { page = 1, limit = 20 } = filter;

    if (!filter.date && !filter.month && !filter.year) {
      const [rows, total] = await this.checkinRepo.findAndCount({
        order: { checkinAt: 'DESC' },
        relations: ['user'],
        skip: (page - 1) * limit,
        take: limit,
      });

      return paginate(rows, total, page, limit);
    }

    if ((filter.month && !filter.year) || (!filter.month && filter.year)) {
      throw new BadRequestException('Mes y año deben enviarse juntos');
    }

    if (filter.month && filter.year) {
      const start = new Date(Date.UTC(filter.year, filter.month - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(filter.year, filter.month, 0, 23, 59, 59, 999));

      const [rows, total] = await this.checkinRepo.findAndCount({
        where: { checkinAt: Between(start, end) },
        order: { checkinAt: 'DESC' },
        relations: ['user'],
        skip: (page - 1) * limit,
        take: limit,
      });

      return paginate(rows, total, page, limit);
    }

    const start = new Date(`${filter.date}T00:00:00.000Z`);
    const end = new Date(`${filter.date}T23:59:59.999Z`);

    const [rows, total] = await this.checkinRepo.findAndCount({
      where: { checkinAt: Between(start, end) },
      order: { checkinAt: 'DESC' },
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(rows, total, page, limit);
  }

  // ── List by user ───────────────────────────────────────────────────────────
  async findByUser(userId: string): Promise<Checkin[]> {
    // Ensure user exists
    await this.usersService.findOne(userId);

    return this.checkinRepo.find({
      where: { userId },
      order: { checkinAt: 'DESC' },
    });
  }

  async exportAttendance(params: { year: number; month?: number }): Promise<{ fileName: string; buffer: Buffer }> {
    const { year, month } = params;

    if (!year || year < 2000 || year > 2100) {
      throw new BadRequestException('El año debe estar entre 2000 y 2100');
    }

    if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new BadRequestException('El mes debe estar entre 1 y 12');
    }

    const start = month
      ? new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
      : new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const end = month
      ? new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
      : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const checkins = await this.checkinRepo.find({
      where: { checkinAt: Between(start, end) },
      relations: ['user'],
      order: { checkinAt: 'ASC' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GymAPI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Asistencias');
    sheet.columns = [
      { header: 'Fecha', key: 'checkinAt', width: 22 },
      { header: 'NroSocio', key: 'memberNumber', width: 14 },
      { header: 'Nombre', key: 'firstName', width: 18 },
      { header: 'Apellido', key: 'lastName', width: 18 },
      { header: 'DNI', key: 'dni', width: 14 },
      { header: 'Plan', key: 'plan', width: 16 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAD3' },
    };

    for (const checkin of checkins) {
      sheet.addRow({
        checkinAt: checkin.checkinAt?.toISOString() ?? '',
        memberNumber: checkin.user?.memberNumber ?? checkin.userId,
        firstName: checkin.user?.firstName ?? '',
        lastName: checkin.user?.lastName ?? '',
        dni: checkin.user?.dni ?? '',
        plan: checkin.user?.plan ?? '',
      });
    }

    const fileSuffix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;
    const fileName = `asistencias_${fileSuffix}.xlsx`;

    const content = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

    return { fileName, buffer };
  }
}

function getWeeklyLimitByPlan(plan: string | null): number | null {
  switch ((plan ?? '').trim().toUpperCase()) {
    case '1_DIA':
    case '1 DIA':
      return 1;
    case '2_DIAS':
    case '2 DIAS':
      return 2;
    case '3_DIAS':
    case '3 DIAS':
      return 3;
    case 'PASE_LIBRE':
    case 'PASE LIBRE':
    case 'LIBRE':
      return null;
    default:
      return null;
  }
}

function getWeekRangeUtc(date: Date): { weekStart: Date; weekEnd: Date } {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);

  const day = normalized.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(normalized);
  weekStart.setUTCDate(normalized.getUTCDate() + offsetToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}
