import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const parseBool = (value?: string): boolean => value === 'true' || value === '1';
const databaseUrl = process.env.DATABASE_URL;

/**
 * TypeORM DataSource used by the migration CLI.
 * The NestJS app uses TypeOrmModule.forRootAsync instead.
 */
export default new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        database: process.env.DB_NAME || 'gym_db',
        username: process.env.DB_USER || 'gym_user',
        password: process.env.DB_PASSWORD || 'gym_password',
      }),
  ssl:
    parseBool(process.env.DB_SSL) || parseBool(process.env.DATABASE_SSL)
      ? { rejectUnauthorized: parseBool(process.env.DB_SSL_REJECT_UNAUTHORIZED) }
      : undefined,
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
