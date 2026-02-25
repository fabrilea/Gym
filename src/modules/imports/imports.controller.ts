import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { ImportsService } from './imports.service';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ValidateImportDto {
  @ApiProperty({ example: '2026-02', description: 'Target month YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthKey debe tener formato YYYY-MM' })
  monthKey: string;
}

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  /**
   * POST /imports/validate
    * Sube un archivo de importación y devuelve una vista previa sin modificar la DB.
   * Creates an ImportJob(VALIDATED) and stores the file.
   */
  @Post('validate')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Solo se aceptan archivos .xlsx'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        monthKey: { type: 'string', example: '2026-02' },
      },
    },
  })
  @ApiOperation({ summary: 'Subir archivo y previsualizar cambios [ADMIN]' })
  validate(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ValidateImportDto,
    @CurrentUser() actor: { id: string },
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    return this.importsService.validate(file, body.monthKey, actor.id);
  }

  /**
   * POST /imports/apply/:importJobId
   * Applies a previously validated ImportJob inside a DB transaction.
   */
  @Post('apply/:importJobId')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @ApiOperation({ summary: 'Aplicar una importación validada [ADMIN]' })
  apply(
    @Param('importJobId', ParseUUIDPipe) importJobId: string,
    @CurrentUser() actor: { id: string },
  ) {
    return this.importsService.apply(importJobId, actor.id);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all import jobs [ADMIN]' })
  findAll() {
    return this.importsService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get an import job [ADMIN]' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.importsService.findOne(id);
  }
}
