import 'dotenv/config';

function requiredEnv(name: string, fallback?: string) {
  const value = String(process.env[name] || fallback || '').trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  nodeEnv: requiredEnv('NODE_ENV', 'development'),
  apiPort: Number(requiredEnv('API_PORT', '3000')),
  webOrigin: requiredEnv('WEB_ORIGIN', 'http://localhost:5173'),
  databaseUrl: requiredEnv('DATABASE_URL'),
  jwtSecret: requiredEnv('JWT_SECRET'),
  tokenEncryptionKey: requiredEnv('TOKEN_ENCRYPTION_KEY'),
  redisUrl: String(process.env.REDIS_URL || '').trim(),
  mediaStorageDriver: String(process.env.MEDIA_STORAGE_DRIVER || 'local')
    .trim()
    .toLowerCase(),
  s3Endpoint: String(process.env.S3_ENDPOINT || '').trim(),
  s3Region: String(process.env.S3_REGION || 'auto').trim(),
  s3Bucket: String(process.env.S3_BUCKET || '').trim(),
  s3AccessKeyId: String(process.env.S3_ACCESS_KEY_ID || '').trim(),
  s3SecretAccessKey: String(process.env.S3_SECRET_ACCESS_KEY || '').trim(),
  s3ForcePathStyle:
    String(process.env.S3_FORCE_PATH_STYLE || 'true').trim() !== 'false',
  sentryDsn: String(process.env.SENTRY_DSN || '').trim(),
  sentryEnvironment: String(
    process.env.SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development',
  ).trim(),
  backupDirectory: String(process.env.DB_BACKUP_DIR || 'private/backups').trim(),
  isProduction: requiredEnv('NODE_ENV', 'development') === 'production',
};