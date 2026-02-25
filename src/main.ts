import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const jwtSecret = configService.get<string>('jwt.secret', '');
  const jwtRefreshSecret = configService.get<string>('jwt.refreshSecret', '');

  app.set('trust proxy', 1);

  if (nodeEnv === 'production' && (!jwtSecret || !jwtRefreshSecret)) {
    throw new Error('JWT_SECRET y JWT_REFRESH_SECRET son obligatorios en producción');
  }

  // ── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters & interceptors ─────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Security headers + cookies ────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = parseCorsOrigins(configService.get<string>('cors.origin', ''));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS blocked by policy'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Swagger ───────────────────────────────────────────────────────────────
  const enableSwagger =
    nodeEnv !== 'production' || configService.get<boolean>('enableSwagger', false);

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Gym Member Management API')
      .setDescription('API for managing gym members, check-ins, imports, and exports')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('port', 3000);
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  if (enableSwagger) {
    console.log(`Swagger docs at: http://localhost:${port}/api/docs`);
  }
}

function parseCorsOrigins(rawOrigins: string): string[] {
  if (!rawOrigins.trim()) return [];
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

bootstrap();
