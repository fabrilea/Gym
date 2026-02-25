import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ExportsService } from './exports.service';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Response } from 'express';
import { createReadStream } from 'fs';

class GenerateExportDto {
  @ApiProperty({ example: '2026-02', description: 'Month to export (YYYY-MM)' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthKey debe tener formato YYYY-MM' })
  monthKey: string;
}

@ApiTags('Exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  /**
   * POST /exports/generate
   * Genera un archivo de exportación con hojas de usuarios y asistencias para el mes.
   */
  @Post('generate')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Generar exportación mensual [ADMIN]' })
  generate(@Body() dto: GenerateExportDto, @CurrentUser() actor: { id: string }) {
    return this.exportsService.generate(dto.monthKey, actor.id);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List export jobs [ADMIN]' })
  @ApiQuery({ name: 'monthKey', required: false })
  findAll(@Query('monthKey') monthKey?: string) {
    return this.exportsService.findAll(monthKey);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get export job with download URL [ADMIN]' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.exportsService.findOne(id);
  }

  @Get(':id/download')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Download export file [ADMIN]' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { absolutePath, fileName } = await this.exportsService.getDownloadFile(id);
    const stream = createReadStream(absolutePath);

    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    return new StreamableFile(stream);
  }
}
