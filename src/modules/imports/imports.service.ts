import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { ImportJob, ImportJobStatus } from './entities/import-job.entity';
import { ImportChange, ImportChangeType } from './entities/import-change.entity';
import { User, MemberStatus } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { parseImportExcel, ParsedRow } from './helpers/excel-parser.helper';

// ── Types returned to the caller ──────────────────────────────────────────────
export interface ChangePreview {
  changeType: ImportChangeType;
  memberNumber: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
}

export interface ValidatePreviewResult {
  importJobId: string;
  counts: {
    total: number;
    created: number;
    updated: number;
    deleted: number;
    noop: number;
    errors: number;
  };
  rowErrors: Array<{ rowNumber: number; messages: string[] }>;
  changes: ChangePreview[];
}

export interface ImportJobResponseDto {
  id: string;
  originalFileName: string;
  monthKey: string;
  status: ImportJobStatus;
  summaryJson: Record<string, any> | null;
  createdAt: Date;
}

/** Fields we include in before/after diffs */
const DIFF_FIELDS: (keyof User)[] = [
  'memberNumber',
  'dni',
  'firstName',
  'lastName',
  'phone',
  'plan',
  'planExpiresAt',
  'status',
];

function pickFields(user: Partial<User>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const f of DIFF_FIELDS) {
    result[f] = (user as any)[f] ?? null;
  }
  return result;
}

function diffObjects(
  before: Record<string, any>,
  after: Record<string, any>,
): { before: Record<string, any>; after: Record<string, any> } | null {
  const bDiff: Record<string, any> = {};
  const aDiff: Record<string, any> = {};
  let changed = false;

  for (const key of Object.keys(after)) {
    const bVal =
      before[key] instanceof Date ? before[key].toISOString().split('T')[0] : before[key];
    const aVal = after[key] instanceof Date ? after[key].toISOString().split('T')[0] : after[key];
    if (String(bVal ?? '') !== String(aVal ?? '')) {
      bDiff[key] = before[key];
      aDiff[key] = after[key];
      changed = true;
    }
  }

  return changed ? { before: bDiff, after: aDiff } : null;
}

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepo: Repository<ImportJob>,
    @InjectRepository(ImportChange)
    private readonly importChangeRepo: Repository<ImportChange>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  // ── VALIDATE ────────────────────────────────────────────────────────────────
  async validate(
    file: Express.Multer.File,
    monthKey: string,
    actorId: string,
  ): Promise<ValidatePreviewResult> {
    // ── 1. Persist file to disk ───────────────────────────────────────────
    const storagePath = this.configService.get<string>('storage.path', './storage');
    const importDir = path.join(storagePath, 'imports');
    fs.mkdirSync(importDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(importDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // ── 2. Parse Excel ────────────────────────────────────────────────────
    let parseResult;
    try {
      parseResult = await parseImportExcel(filePath);
    } catch (err) {
      // Clean up saved file on parse error
      fs.unlinkSync(filePath);
      throw new BadRequestException(`No se pudo leer el archivo: ${err.message}`);
    }

    const { rows, rowErrors } = parseResult;

    // ── 3. Cross-row duplicate memberNumber check ─────────────────────────
    const memberNumbersSeen = new Set<string>();
    const duplicateErrors: Array<{ rowNumber: number; messages: string[] }> = [];
    const validRows: ParsedRow[] = [];

    for (const row of rows) {
      if (memberNumbersSeen.has(row.memberNumber)) {
        duplicateErrors.push({
          rowNumber: row.rowNumber,
          messages: [`memberNumber duplicado "${row.memberNumber}" en el archivo`],
        });
      } else {
        memberNumbersSeen.add(row.memberNumber);
        validRows.push(row);
      }
    }

    const allErrors = [...rowErrors, ...duplicateErrors];

    // ── 4. Compute diff against DB (for PREVIEW) ─────────────────────────
    const memberNumbers = validRows.map((r) => r.memberNumber);
    let existingUsers: User[] = [];
    if (memberNumbers.length > 0) {
      existingUsers = await this.userRepo
        .createQueryBuilder('u')
        .where('u.memberNumber IN (:...memberNumbers)', { memberNumbers })
        .getMany();
    }
    const existingMap = new Map(existingUsers.map((u) => [u.memberNumber, u]));

    const changes: ChangePreview[] = [];
    let created = 0,
      updated = 0,
      deleted = 0,
      noop = 0;

    for (const row of validRows) {
      const existing = existingMap.get(row.memberNumber) ?? null;

      if (row.action === 'DELETE') {
        if (!existing) {
          allErrors.push({
            rowNumber: row.rowNumber,
            messages: [`No se puede DELETE: el socio "${row.memberNumber}" no existe`],
          });
          continue;
        }
        changes.push({
          changeType: ImportChangeType.DELETE,
          memberNumber: row.memberNumber,
          before: pickFields(existing),
          after: null,
        });
        deleted++;
        continue;
      }

      // UPSERT
      const afterFields = pickFields({
        memberNumber: row.memberNumber,
        dni: row.dni ?? null,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone ?? null,
        plan: row.plan ?? null,
        planExpiresAt: row.planExpiresAt ?? null,
        status: row.status ?? MemberStatus.ACTIVE,
      });

      if (!existing) {
        changes.push({
          changeType: ImportChangeType.CREATE,
          memberNumber: row.memberNumber,
          before: null,
          after: afterFields,
        });
        created++;
      } else {
        const diff = diffObjects(pickFields(existing), afterFields);
        if (diff) {
          changes.push({
            changeType: ImportChangeType.UPDATE,
            memberNumber: row.memberNumber,
            before: diff.before,
            after: diff.after,
          });
          updated++;
        } else {
          changes.push({
            changeType: ImportChangeType.NOOP,
            memberNumber: row.memberNumber,
            before: null,
            after: null,
          });
          noop++;
        }
      }
    }

    const summary = {
      total: validRows.length,
      created,
      updated,
      deleted,
      noop,
      errors: allErrors.length,
    };

    // ── 5. Persist ImportJob ──────────────────────────────────────────────
    const job = this.importJobRepo.create({
      originalFileName: file.originalname,
      storagePath: filePath,
      monthKey,
      uploadedByUserId: actorId,
      status: ImportJobStatus.VALIDATED,
      summaryJson: { ...summary, rowErrors: allErrors, changes },
    });
    const savedJob = await this.importJobRepo.save(job);

    // ── 6. Persist ImportChange records ───────────────────────────────────
    if (changes.length > 0) {
      const changeEntities = changes.map((c) =>
        this.importChangeRepo.create({
          importJobId: savedJob.id,
          changeType: c.changeType,
          memberNumber: c.memberNumber,
          beforeJson: c.before,
          afterJson: c.after,
        }),
      );
      await this.importChangeRepo.save(changeEntities);
    }

    return {
      importJobId: savedJob.id,
      counts: summary,
      rowErrors: allErrors,
      changes,
    };
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  async apply(importJobId: string, actorId: string): Promise<ImportJobResponseDto> {
    const job = await this.importJobRepo.findOne({ where: { id: importJobId } });
    if (!job) throw new NotFoundException(`No se encontró la importación ${importJobId}`);
    if (job.status !== ImportJobStatus.VALIDATED) {
      throw new BadRequestException(
        `La importación está en estado "${job.status}". Solo se pueden aplicar importaciones VALIDATED`,
      );
    }

    const summary = job.summaryJson as any;
    if (summary?.errors > 0) {
      throw new BadRequestException(
        `La importación tiene ${summary.errors} error(es) de validación. Corrige el archivo y vuelve a subirlo.`,
      );
    }

    // Reload the parsed changes stored in the job
    const changeRecords = await this.importChangeRepo.find({
      where: { importJobId },
    });

    const appliedCounts = { created: 0, updated: 0, deleted: 0, noop: 0 };

    try {
      await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);

        for (const change of changeRecords) {
          if (change.changeType === ImportChangeType.NOOP) {
            appliedCounts.noop++;
            continue;
          }

          if (change.changeType === ImportChangeType.DELETE) {
            const user = await userRepo.findOne({
              where: { memberNumber: change.memberNumber },
            });
            if (user) {
              await userRepo.softRemove(user);
              appliedCounts.deleted++;
            }
            continue;
          }

          // CREATE or UPDATE → upsert
          let user = await userRepo.findOne({
            where: { memberNumber: change.memberNumber },
          });

          const afterData = change.afterJson as Partial<User>;

          if (!user) {
            user = userRepo.create({
              memberNumber: change.memberNumber,
              ...afterData,
            });
            appliedCounts.created++;
          } else {
            // Apply only the fields present in afterJson (diff-only for UPDATE)
            Object.assign(user, afterData);
            appliedCounts.updated++;
          }

          const saved = await userRepo.save(user);

          // Update change record with resolved userId
          await manager.getRepository(ImportChange).update(change.id, {
            userId: saved.id,
          });
        }

        // Mark job APPLIED
        await manager.getRepository(ImportJob).update(importJobId, {
          status: ImportJobStatus.APPLIED,
          summaryJson: { ...summary, applied: appliedCounts },
        });
      });
    } catch (err) {
      // Mark job FAILED outside the failed transaction
      await this.importJobRepo.update(importJobId, {
        status: ImportJobStatus.FAILED,
        summaryJson: { ...summary, error: err.message },
      });
      throw new BadRequestException(`La importación falló y se revirtió: ${err.message}`);
    }

    await this.auditService.log({
      actorUserId: actorId,
      action: 'IMPORT_APPLY',
      entity: 'ImportJob',
      entityId: importJobId,
      afterJson: appliedCounts,
    });

    const appliedJob = await this.importJobRepo.findOne({ where: { id: importJobId } });
    if (!appliedJob) {
      throw new NotFoundException(`No se encontró la importación ${importJobId}`);
    }

    return this.toResponse(appliedJob);
  }

  // ── List jobs ──────────────────────────────────────────────────────────────
  async findAll(): Promise<ImportJobResponseDto[]> {
    const jobs = await this.importJobRepo.find({ order: { createdAt: 'DESC' } });
    return jobs.map((job) => this.toResponse(job));
  }

  async findOne(id: string): Promise<ImportJobResponseDto | null> {
    const job = await this.importJobRepo.findOne({ where: { id } });
    return job ? this.toResponse(job) : null;
  }

  private toResponse(job: ImportJob): ImportJobResponseDto {
    return {
      id: job.id,
      originalFileName: job.originalFileName,
      monthKey: job.monthKey,
      status: job.status,
      summaryJson: job.summaryJson,
      createdAt: job.createdAt,
    };
  }
}
