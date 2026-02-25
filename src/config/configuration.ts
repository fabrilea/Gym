const parseBool = (value?: string): boolean => value === 'true' || value === '1';
const isLikelyNeonUrl = (value?: string): boolean => Boolean(value && value.includes('neon.tech'));

export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  enableSwagger: parseBool(process.env.ENABLE_SWAGGER),

  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'gym_db',
    user: process.env.DB_USER || 'gym_user',
    password: process.env.DB_PASSWORD || 'gym_password',
    ssl:
      parseBool(process.env.DB_SSL) ||
      parseBool(process.env.DATABASE_SSL) ||
      isLikelyNeonUrl(process.env.DATABASE_URL),
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED
      ? parseBool(process.env.DB_SSL_REJECT_UNAUTHORIZED)
      : false,
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  storage: {
    path: process.env.STORAGE_PATH || './storage',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 10,
  },
});
