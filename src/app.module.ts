import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CheckinsModule } from './modules/checkins/checkins.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ExportsModule } from './modules/exports/exports.module';
import { AuditModule } from './modules/audit/audit.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // ── Rate limiting ──────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl', 60) * 1000,
          limit: config.get<number>('throttle.limit', 10),
        },
      ],
    }),

    // ── Database ───────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('database.url', '');
        const useSsl = config.get<boolean>('database.ssl', false);
        const sslRejectUnauthorized = config.get<boolean>('database.sslRejectUnauthorized', false);

        return {
          type: 'postgres',
          ...(databaseUrl
            ? { url: databaseUrl }
            : {
                host: config.get<string>('database.host', 'localhost'),
                port: config.get<number>('database.port', 5432),
                database: config.get<string>('database.name', 'gym_db'),
                username: config.get<string>('database.user', 'gym_user'),
                password: config.get<string>('database.password', 'gym_password'),
              }),
          ssl: useSsl ? { rejectUnauthorized: sslRejectUnauthorized } : undefined,
          // Entities discovered automatically from modules
          autoLoadEntities: true,
          synchronize: config.get('nodeEnv') === 'development', // use migrations in production
          logging: config.get('nodeEnv') === 'development',
          migrations: ['dist/migrations/*{.ts,.js}'],
          migrationsRun: false,
        };
      },
    }),

    // ── Feature modules ────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CheckinsModule,
    ImportsModule,
    ExportsModule,
    AuditModule,
    BillingModule,
  ],
})
export class AppModule {}
