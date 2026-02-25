import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { Response } from 'express';
import { CheckinsService } from './checkins.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { FilterCheckinsDto } from './dto/filter-checkins.dto';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

class PublicCheckinByDniDto {
  @ApiProperty({ example: '30123456' })
  @IsString()
  dni: string;
}

@ApiTags('Checkins')
@ApiBearerAuth()
@Controller('checkins')
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Public()
  @Post('by-dni')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registro público de ingreso por DNI (kiosco)' })
  createByDni(@Body() dto: PublicCheckinByDniDto) {
    return this.checkinsService.createPublicByDni(dto.dni);
  }

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar ingreso de socio [ADMIN]' })
  create(@Body() dto: CreateCheckinDto, @CurrentUser() actor: { id: string }) {
    return this.checkinsService.create(dto, actor.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar asistencias por fecha o por mes/año' })
  findAll(@Query() filter: FilterCheckinsDto) {
    return this.checkinsService.findByDate(filter);
  }

  @Get('export/attendance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Descargar asistencias en Excel por mes o por año [ADMIN]' })
  async exportAttendance(
    @Query('year', ParseIntPipe) year: number,
    @Query('month') monthRaw: string | undefined,
    @Res() res: Response,
  ) {
    const month = monthRaw ? Number(monthRaw) : undefined;
    const { fileName, buffer } = await this.checkinsService.exportAttendance({ year, month });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'Listar asistencias de un socio' })
  findByUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.checkinsService.findByUser(id);
  }
}
