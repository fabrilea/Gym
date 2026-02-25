import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto, RegisterResponseDto } from './dto/register.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new operator account [ADMIN]' })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.registerOperator(dto);
  }

  @Post('register-admin')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new admin account [ADMIN]' })
  registerAdmin(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.registerAdmin(dto);
  }

  @Get('admins')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List admins [ADMIN]' })
  listAdmins(@Query() query: PaginationDto) {
    return this.authService.listAdmins(query.page ?? 1, query.limit ?? 20);
  }

  @Put('admins/:id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update admin data and password [ADMIN]' })
  updateAdmin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
    return this.authService.updateAdmin(id, dto);
  }

  @Delete('admins/:id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete admin [ADMIN]' })
  removeAdmin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: { id: string }) {
    return this.authService.removeAdmin(id, actor.id);
  }

  /**
   * POST /auth/login
   * Rate-limited to 5 attempts per 60 s
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Admin login by DNI and password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const auth = await this.authService.login(dto);
    this.setRefreshCookie(response, auth.refreshToken);
    return auth;
  }

  /**
   * POST /auth/refresh
   * Accepts a valid refresh token and returns a new pair
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({ summary: 'Rotate JWT tokens using a refresh token' })
  async refresh(
    @CurrentUser() user: { sub: string; refreshToken: string },
    @Body() _dto: RefreshTokenDto, // validated via class-validator
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const auth = await this.authService.refresh(user.sub, user.refreshToken);
    this.setRefreshCookie(response, auth.refreshToken);
    return auth;
  }

  /**
   * POST /auth/logout
   * Revokes the stored refresh token hash
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.clearRefreshCookie(response);
    return this.authService.logout(user.id);
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: this.parseDurationToMs(this.configService.get<string>('jwt.refreshExpiresIn', '7d')),
    });
  }

  private clearRefreshCookie(response: Response): void {
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
  }

  private parseDurationToMs(input: string): number {
    const raw = (input ?? '').trim();
    if (!raw) return 7 * 24 * 60 * 60 * 1000;

    const match = raw.match(/^(\d+)([smhd])$/i);
    if (!match) return 7 * 24 * 60 * 60 * 1000;

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (Number.isNaN(value) || value <= 0) return 7 * 24 * 60 * 60 * 1000;

    const factors: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * factors[unit];
  }
}
