import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ExportJob } from './entities/export-job.entity';
import { User } from '../users/entities/user.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { AuditService } from '../audit/audit.service';
import { ExportJobResponseDto } from './dto/export-job-response.dto';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(ExportJob)
    private readonly exportJobRepo: Repository<ExportJob>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Checkin)
    private readonly checkinRepo: Repository<Checkin>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  // ── Generate Excel export for a month ─────────────────────────────────────
  async generate(monthKey: string, actorId: string): Promise<ExportJobResponseDto> {
    // ── 1. Query data ─────────────────────────────────────────────────────
    const users = await this.userRepo
      .createQueryBuilder('u')
      .withDeleted() // include soft-deleted for historical exports
      .orderBy('u.memberNumber', 'ASC')
      .getMany();

    const [year, month] = monthKey.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const checkins = await this.checkinRepo.find({
      where: { checkinAt: Between(startOfMonth, endOfMonth) },
      relations: ['user'],
      order: { checkinAt: 'ASC' },
    });

    // ── 2. Build workbook ─────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GymAPI';
    workbook.created = new Date();

    // ── Sheet: Users ──────────────────────────────────────────────────────
    const usersSheet = workbook.addWorksheet('Users');
    usersSheet.columns = [
      { header: 'memberNumber', key: 'memberNumber', width: 15 },
      { header: 'firstName', key: 'firstName', width: 18 },
      { header: 'lastName', key: 'lastName', width: 18 },
      { header: 'dni', key: 'dni', width: 14 },
      { header: 'phone', key: 'phone', width: 16 },
      { header: 'plan', key: 'plan', width: 18 },
      { header: 'planExpiresAt', key: 'planExpiresAt', width: 16 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'createdAt', key: 'createdAt', width: 22 },
      { header: 'deletedAt', key: 'deletedAt', width: 22 },
    ];

    // Style header row
    usersSheet.getRow(1).font = { bold: true };
    usersSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAD3' },
    };

    for (const user of users) {
      usersSheet.addRow({
        memberNumber: user.memberNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        dni: user.dni ?? '',
        phone: user.phone ?? '',
        plan: user.plan ?? '',
        planExpiresAt: user.planExpiresAt
          ? new Date(user.planExpiresAt).toISOString().split('T')[0]
          : '',
        status: user.status,
        createdAt: user.createdAt?.toISOString() ?? '',
        deletedAt: user.deletedAt?.toISOString() ?? '',
      });
    }

    // ── Sheet: Checkins ───────────────────────────────────────────────────
    const checkinsSheet = workbook.addWorksheet('Checkins');
    checkinsSheet.columns = [
      { header: 'checkinId', key: 'checkinId', width: 38 },
      { header: 'memberNumber', key: 'memberNumber', width: 15 },
      { header: 'firstName', key: 'firstName', width: 18 },
      { header: 'lastName', key: 'lastName', width: 18 },
      { header: 'checkinAt', key: 'checkinAt', width: 26 },
    ];
    checkinsSheet.getRow(1).font = { bold: true };
    checkinsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAD3' },
    };

    for (const checkin of checkins) {
      checkinsSheet.addRow({
        checkinId: checkin.id,
        memberNumber: checkin.user?.memberNumber ?? checkin.userId,
        firstName: checkin.user?.firstName ?? '',
        lastName: checkin.user?.lastName ?? '',
        checkinAt: checkin.checkinAt?.toISOString() ?? '',
      });
    }

    // ── 3. Save file ──────────────────────────────────────────────────────
    const storagePath = this.configService.get<string>('storage.path', './storage');
    const exportDir = path.join(storagePath, 'exports', monthKey);
    fs.mkdirSync(exportDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `export_${monthKey}_${timestamp}.xlsx`;
    const filePath = path.join(exportDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    // ── 4. Compute SHA-256 hash ────────────────────────────────────────────
    const fileBuffer = fs.readFileSync(filePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // ── 5. Persist ExportJob ──────────────────────────────────────────────
    const job = this.exportJobRepo.create({
      monthKey,
      generatedByUserId: actorId,
      filePath: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
      fileHash,
    });
    const savedJob = await this.exportJobRepo.save(job);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'EXPORT_GENERATE',
      entity: 'ExportJob',
      entityId: savedJob.id,
      afterJson: { monthKey, fileName, fileHash },
    });

    return this.toResponse(savedJob);
  }

  // ── List exports ───────────────────────────────────────────────────────────
  async findAll(monthKey?: string): Promise<ExportJobResponseDto[]> {
    const where = monthKey ? { monthKey } : {};
    const jobs = await this.exportJobRepo.find({ where, order: { createdAt: 'DESC' } });
    return jobs.map((job) => this.toResponse(job));
  }

  // ── Get single export job with resolved download path ─────────────────────
  async findOne(id: string): Promise<ExportJobResponseDto> {
    const job = await this.exportJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`No se encontró la exportación ${id}`);

    return this.toResponse(job);
  }

  async getDownloadFile(id: string): Promise<{ absolutePath: string; fileName: string }> {
    const job = await this.exportJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`No se encontró la exportación ${id}`);

    const storagePath = this.configService.get<string>('storage.path', './storage');
    const storageRoot = path.resolve(process.cwd(), storagePath);
    const absolutePath = path.resolve(process.cwd(), job.filePath);
    const relativeToStorage = path.relative(storageRoot, absolutePath);

    if (relativeToStorage.startsWith('..') || path.isAbsolute(relativeToStorage)) {
      throw new BadRequestException('Ruta de archivo inválida');
    }

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('El archivo de exportación no existe');
    }

    return {
      absolutePath,
      fileName: path.basename(absolutePath),
    };
  }

  private toResponse(job: ExportJob): ExportJobResponseDto {
    return {
      id: job.id,
      monthKey: job.monthKey,
      createdAt: job.createdAt,
      downloadUrl: `/api/v1/exports/${job.id}/download`,
    };
  }
}
