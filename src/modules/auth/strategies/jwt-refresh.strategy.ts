import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy';

const REFRESH_COOKIE_NAME = 'refresh_token';

function extractRefreshToken(req: Request): string | null {
  const fromBody = req.body?.refreshToken;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;

  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.trim()) return fromCookie;

  return null;
}

/**
 * Passport strategy for refresh tokens.
 * Extracts the raw token so the service can verify its hash.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req: Request) => extractRefreshToken(req)]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) throw new UnauthorizedException('Falta el refresh token');
    return { ...payload, refreshToken };
  }
}
