import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, QueryFailedError } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  private static readonly MEMBER_NUMBER_PAD = 6;
  private static readonly CREATE_RETRIES = 5;
  private static readonly PLAN_DURATION_DAYS = 31;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  // ── List with pagination and search ────────────────────────────────────────
  async findAll(query: SearchUsersDto): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 20, memberNumber, dni, name } = query;

    const qb = this.userRepo.createQueryBuilder('u').where('u.deletedAt IS NULL');

    if (memberNumber) {
      qb.andWhere('u.memberNumber ILIKE :memberNumber', {
        memberNumber: `%${memberNumber}%`,
      });
    }
    if (dni) {
      qb.andWhere('u.dni ILIKE :dni', { dni: `%${dni}%` });
    }
    if (name) {
      qb.andWhere(
        "(u.firstName ILIKE :name OR u.lastName ILIKE :name OR CONCAT(u.firstName, ' ', u.lastName) ILIKE :name)",
        { name: `%${name}%` },
      );
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('u.memberNumber', 'ASC')
      .getManyAndCount();

    return paginate(data, total, page, limit);
  }

  // ── Find one ───────────────────────────────────────────────────────────────
  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`No se encontró el socio ${id}`);
    return user;
  }

  async findByMemberNumber(memberNumber: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { memberNumber } });
  }

  async findByDni(dni: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { dni } });
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async create(dto: CreateUserDto, actorId: string): Promise<User> {
    let saved: User | null = null;

    for (let attempt = 0; attempt < UsersService.CREATE_RETRIES; attempt++) {
      const memberNumber = await this.generateNextMemberNumber();
      const user = this.userRepo.create({
        ...dto,
        planExpiresAt: this.resolvePlanExpiration(dto),
        memberNumber,
      });

      try {
        saved = await this.userRepo.save(user);
        break;
      } catch (error) {
        if (this.isMemberNumberUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    if (!saved) {
      throw new ConflictException('No se pudo generar un número de socio único. Intenta nuevamente.');
    }

    await this.auditService.log({
      actorUserId: actorId,
      action: 'USER_CREATE',
      entity: 'User',
      entityId: saved.id,
      afterJson: saved,
    });

    return saved;
  }

  private async generateNextMemberNumber(): Promise<string> {
    const raw = await this.userRepo
      .createQueryBuilder('u')
      .select(
        `MAX(CASE WHEN u.memberNumber ~ '^[0-9]+$' THEN CAST(u.memberNumber AS BIGINT) ELSE 0 END)`,
        'maxNumber',
      )
      .withDeleted()
      .getRawOne<{ maxNumber: string | null }>();

    const currentMax = Number(raw?.maxNumber ?? 0);
    const nextValue = currentMax + 1;
    return String(nextValue).padStart(UsersService.MEMBER_NUMBER_PAD, '0');
  }

  private isMemberNumberUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const pgError = error as QueryFailedError & { code?: string; detail?: string };
    return pgError.code === '23505' && (pgError.detail?.includes('(memberNumber)') ?? false);
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<User> {
    const user = await this.findOne(id);

    const before = { ...user };
    Object.assign(user, {
      ...dto,
      planExpiresAt: this.resolvePlanExpiration(dto, user.planExpiresAt),
    });
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'USER_UPDATE',
      entity: 'User',
      entityId: saved.id,
      beforeJson: before,
      afterJson: saved,
    });

    return saved;
  }

  // ── Soft delete ────────────────────────────────────────────────────────────
  async remove(id: string, actorId: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepo.softRemove(user);

    await this.auditService.log({
      actorUserId: actorId,
      action: 'USER_DELETE',
      entity: 'User',
      entityId: id,
      beforeJson: user,
    });
  }

  // ── Upsert (used by import service) ───────────────────────────────────────
  async upsert(
    dto: Partial<User> & { memberNumber: string },
    actorId: string,
    _auditAction: 'USER_CREATE' | 'USER_UPDATE' = 'USER_UPDATE',
  ): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { memberNumber: dto.memberNumber },
    });

    if (!existing) {
      const user = this.userRepo.create({
        ...(dto as DeepPartial<User>),
        planExpiresAt: this.resolvePlanExpiration(dto),
      });
      const saved = await this.userRepo.save(user);
      await this.auditService.log({
        actorUserId: actorId,
        action: 'USER_CREATE',
        entity: 'User',
        entityId: saved.id,
        afterJson: saved,
      });
      return saved;
    }

    const before = { ...existing };
    Object.assign(existing, {
      ...dto,
      planExpiresAt: this.resolvePlanExpiration(dto, existing.planExpiresAt),
    });
    const saved = await this.userRepo.save(existing);

    // Only log if something actually changed
    const changed = JSON.stringify(before) !== JSON.stringify(saved);
    if (changed) {
      await this.auditService.log({
        actorUserId: actorId,
        action: 'USER_UPDATE',
        entity: 'User',
        entityId: saved.id,
        beforeJson: before,
        afterJson: saved,
      });
    }

    return saved;
  }

  private resolvePlanExpiration(
    dto: { plan?: string | null; planExpiresAt?: string | Date | null },
    fallback: Date | null = null,
  ): Date | null {
    if (!dto.plan) {
      if (dto.planExpiresAt instanceof Date) {
        return dto.planExpiresAt;
      }

      if (typeof dto.planExpiresAt === 'string') {
        const parsed = new Date(dto.planExpiresAt);
        return Number.isNaN(parsed.getTime()) ? fallback : parsed;
      }

      return fallback;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + UsersService.PLAN_DURATION_DAYS);
    return now;
  }
}
