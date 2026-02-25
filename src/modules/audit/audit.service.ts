import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditLogPayload {
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  beforeJson?: Record<string, any> | null;
  afterJson?: Record<string, any> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(payload: AuditLogPayload): Promise<AuditLog> {
    try {
      const entry = this.auditRepo.create({
        actorUserId: payload.actorUserId,
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId,
        beforeJson: payload.beforeJson ?? null,
        afterJson: payload.afterJson ?? null,
      });
      return await this.auditRepo.save(entry);
    } catch (err) {
      // Audit failures must NEVER break the main flow
      this.logger.error('Failed to write audit log', err);
    }
  }

  async findByEntity(entity: string, entityId: string): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { entity, entityId },
      order: { createdAt: 'DESC' },
    });
  }
}
