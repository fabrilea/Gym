import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Operator } from '../entities/operator.entity';

export interface JwtPayload {
  sub: string; // operator id
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Operator)
    private readonly operatorRepo: Repository<Operator>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const operator = await this.operatorRepo.findOne({ where: { id: payload.sub } });
    if (!operator) throw new UnauthorizedException('Operador no encontrado');
    // Attach operator to request
    return { id: operator.id, role: operator.role };
  }
}
