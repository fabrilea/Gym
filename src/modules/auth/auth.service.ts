import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Operator, OperatorRole } from './entities/operator.entity';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { RegisterDto, RegisterResponseDto } from './dto/register.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';

export interface AdminItemDto {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  role: OperatorRole;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Operator)
    private readonly operatorRepo: Repository<Operator>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const normalizedDni = dto.dni.trim();
    const operator = await this.operatorRepo.findOne({
      where: { dni: normalizedDni, role: OperatorRole.ADMIN },
    });

    if (!operator) throw new UnauthorizedException('Credenciales inválidas');

    const passwordMatch = await bcrypt.compare(dto.password, operator.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Credenciales inválidas');

    return this.issueTokens(operator);
  }

  async registerOperator(dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.createOperator(dto, OperatorRole.OPERATOR);
  }

  async registerAdmin(dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.createOperator(dto, OperatorRole.ADMIN);
  }

  async listAdmins(page = 1, limit = 20): Promise<PaginatedResult<AdminItemDto>> {
    const [admins, total] = await this.operatorRepo.findAndCount({
      where: { role: OperatorRole.ADMIN },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const rows: AdminItemDto[] = admins.map((admin) => ({
      id: admin.id,
      dni: admin.dni ?? '',
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }));

    return paginate(rows, total, page, limit);
  }

  async updateAdmin(adminId: string, dto: UpdateAdminDto): Promise<AdminItemDto> {
    const admin = await this.operatorRepo.findOne({ where: { id: adminId, role: OperatorRole.ADMIN } });
    if (!admin) {
      throw new NotFoundException(`No se encontró el admin ${adminId}`);
    }

    if (dto.dni && dto.dni.trim() !== (admin.dni ?? '')) {
      const existing = await this.operatorRepo.findOne({ where: { dni: dto.dni.trim() } });
      if (existing && existing.id !== admin.id) {
        throw new ConflictException('El DNI ya está registrado');
      }
      admin.dni = dto.dni.trim();
    }

    if (dto.firstName) {
      admin.firstName = dto.firstName.trim();
    }

    if (dto.lastName) {
      admin.lastName = dto.lastName.trim();
    }

    if (dto.password) {
      admin.passwordHash = await bcrypt.hash(dto.password, 12);
      admin.refreshTokenHash = null;
    }

    const saved = await this.operatorRepo.save(admin);

    return {
      id: saved.id,
      dni: saved.dni ?? '',
      firstName: saved.firstName,
      lastName: saved.lastName,
      role: saved.role,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async removeAdmin(adminId: string, actorId: string): Promise<void> {
    if (adminId === actorId) {
      throw new BadRequestException('No puedes eliminar tu propio usuario admin');
    }

    const admin = await this.operatorRepo.findOne({ where: { id: adminId, role: OperatorRole.ADMIN } });
    if (!admin) {
      throw new NotFoundException(`No se encontró el admin ${adminId}`);
    }

    const adminCount = await this.operatorRepo.count({ where: { role: OperatorRole.ADMIN } });
    if (adminCount <= 1) {
      throw new BadRequestException('No se puede eliminar el último admin del sistema');
    }

    await this.operatorRepo.softRemove(admin);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  async refresh(operatorId: string, rawRefreshToken: string): Promise<LoginResponseDto> {
    const operator = await this.operatorRepo.findOne({ where: { id: operatorId } });
    if (!operator || !operator.refreshTokenHash) {
      throw new UnauthorizedException('La sesión expiró. Inicia sesión nuevamente');
    }

    const tokenMatch = await bcrypt.compare(rawRefreshToken, operator.refreshTokenHash);
    if (!tokenMatch) throw new UnauthorizedException('Refresh token inválido');

    return this.issueTokens(operator);
  }

  // ── Logout (revoke refresh token) ─────────────────────────────────────────
  async logout(operatorId: string): Promise<void> {
    await this.operatorRepo.update(operatorId, { refreshTokenHash: null });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────
  private async createOperator(
    dto: RegisterDto,
    role: OperatorRole,
  ): Promise<RegisterResponseDto> {
    const dni = dto.dni.trim();

    const existing = await this.operatorRepo.findOne({ where: { dni } });
    if (existing) throw new ConflictException('El DNI ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const operator = this.operatorRepo.create({
      dni,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      role,
      passwordHash,
    });

    const saved = await this.operatorRepo.save(operator);

    return {
      id: saved.id,
      dni: saved.dni ?? '',
      firstName: saved.firstName,
      lastName: saved.lastName,
      role: saved.role,
      createdAt: saved.createdAt,
    };
  }

  private async issueTokens(operator: Operator): Promise<LoginResponseDto> {
    const tokenPayload = { sub: operator.id, role: operator.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    // Store hashed refresh token for rotation verification
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.operatorRepo.update(operator.id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    };
  }
}
