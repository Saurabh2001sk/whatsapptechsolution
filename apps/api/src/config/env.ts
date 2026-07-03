import 'dotenv/config';

const unsafePlaceholderValues = new Set([
'available',
'not available',
'not added in render',
'todo',
'changeme',
'change_me',
'your_value_here',
]);

function cleanEnvValue(name: string, value: string) {
const cleaned = String(value || '').trim();

if (unsafePlaceholderValues.has(cleaned.toLowerCase())) {
throw new Error(
'Environment variable ' +
name +
' still has an unsafe placeholder value',
);
}

return cleaned;
}

function requiredEnv(name: string, fallback?: string) {
const value = cleanEnvValue(
name,
String(process.env[name] || fallback || ''),
);

if (!value) {
throw new Error('Missing required environment variable: ' + name);
}

return value;
}

function optionalEnv(name: string, fallback = '') {
const rawValue =
process.env[name] === undefined ? fallback : String(process.env[name]);

return cleanEnvValue(name, rawValue);
}

function numberEnv(name: string, fallback: number) {
const value = Number.parseInt(optionalEnv(name), 10);

return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const env = {
nodeEnv: requiredEnv('NODE_ENV', 'development'),
apiPort: Number(requiredEnv('API_PORT', '3000')),
webOrigin: requiredEnv('WEB_ORIGIN', 'http://localhost:5173'),
databaseUrl: requiredEnv('DATABASE_URL'),
jwtSecret: requiredEnv('JWT_SECRET'),
tokenEncryptionKey: requiredEnv('TOKEN_ENCRYPTION_KEY'),

redisUrl: optionalEnv('REDIS_URL'),

mediaStorageDriver: optionalEnv('MEDIA_STORAGE_DRIVER', 'local')
.trim()
.toLowerCase(),
mediaMaxFileSizeBytes: numberEnv(
'MEDIA_MAX_FILE_SIZE_BYTES',
20 * 1024 * 1024,
),

s3Endpoint: optionalEnv('S3_ENDPOINT'),
s3Region: optionalEnv('S3_REGION', 'auto'),
s3Bucket: optionalEnv('S3_BUCKET'),
s3AccessKeyId: optionalEnv('S3_ACCESS_KEY_ID'),
s3SecretAccessKey: optionalEnv('S3_SECRET_ACCESS_KEY'),
s3ForcePathStyle: optionalEnv('S3_FORCE_PATH_STYLE', 'true') !== 'false',

sentryDsn: optionalEnv('SENTRY_DSN'),
sentryEnvironment: optionalEnv(
'SENTRY_ENVIRONMENT',
process.env.NODE_ENV || 'development',
),

backupDirectory: optionalEnv('DB_BACKUP_DIR', 'private/backups'),
enableApiCampaignProcessor:
process.env.ENABLE_API_CAMPAIGN_PROCESSOR === 'true',

isProduction: requiredEnv('NODE_ENV', 'development') === 'production',
};