const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function safeFileName(fileName = 'media.bin') {
  const clean = String(fileName || 'media.bin')
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9_. -]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 160);

  return clean || 'media.bin';
}

function encodeStorageKey(key = '') {
  return Buffer.from(String(key), 'utf8').toString('base64url');
}

function decodeStorageKey(value = '') {
  try {
    return Buffer.from(String(value), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function createMediaStorage({ mediaRoot }) {
  const driver = String(process.env.MEDIA_STORAGE_DRIVER || process.env.OBJECT_STORAGE_DRIVER || 'local')
    .trim()
    .toLowerCase();

  const bucket = String(process.env.MEDIA_STORAGE_BUCKET || process.env.S3_BUCKET || '').trim();
  const region = String(process.env.MEDIA_STORAGE_REGION || process.env.AWS_REGION || 'auto').trim();
  const endpoint = String(process.env.MEDIA_STORAGE_ENDPOINT || process.env.S3_ENDPOINT || '').trim();
  const accessKeyId = String(process.env.MEDIA_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const forcePathStyle = boolEnv(process.env.MEDIA_STORAGE_FORCE_PATH_STYLE, Boolean(endpoint));

  const s3Enabled = driver === 's3'
    && bucket
    && accessKeyId
    && secretAccessKey
    && (region || endpoint);

  const localProductionAllowed = boolEnv(process.env.MEDIA_STORAGE_ALLOW_LOCAL_IN_PRODUCTION, false);

  if (process.env.NODE_ENV === 'production' && !s3Enabled && !localProductionAllowed) {
    throw new Error('Production media storage requires MEDIA_STORAGE_DRIVER=s3 with bucket credentials. Set MEDIA_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true only for temporary non-customer testing.');
  }

  const client = s3Enabled
    ? new S3Client({
      region: region || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
    : null;

  function makeObjectKey({ tenantId, fileName, source = 'whatsapp' }) {
    const tenantPart = String(tenantId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = safeFileName(fileName);
    const uniquePart = `${Date.now()}-${crypto.randomUUID()}`;
    return `tenants/${tenantPart}/${source}/${uniquePart}-${safeName}`;
  }

  async function putTenantMediaObject({
    tenantId,
    buffer,
    fileName,
    mimeType,
    source = 'whatsapp',
  }) {
    if (!buffer?.length) {
      return { provider: null, storageKey: null, mediaUrl: null, mediaLocalPath: null };
    }

    if (s3Enabled) {
      const storageKey = makeObjectKey({ tenantId, fileName, source });

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
        Metadata: {
          tenant_id: String(tenantId || ''),
          source,
        },
      }));

      return {
        provider: 's3',
        storageKey,
        mediaUrl: `/media/whatsapp/${encodeStorageKey(storageKey)}`,
        mediaLocalPath: null,
      };
    }

    const localName = `${Date.now()}-${crypto.randomUUID()}-${safeFileName(fileName)}`;
    const localPath = path.join(mediaRoot, localName);

    if (!localPath.startsWith(mediaRoot)) {
      throw new Error('Invalid local media path');
    }

    fs.writeFileSync(localPath, buffer);

    return {
      provider: 'local',
      storageKey: localName,
      mediaUrl: `/media/whatsapp/${localName}`,
      mediaLocalPath: localPath,
    };
  }

  async function getTenantMediaStream(storageKey) {
    if (!s3Enabled || !storageKey) return null;

    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }));

    return {
      body: response.Body,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || null,
    };
  }

  async function getSignedTenantMediaUrl(storageKey, expiresIn = 300) {
    if (!s3Enabled || !storageKey) return null;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  return {
    driver: s3Enabled ? 's3' : 'local',
    isObjectStorageEnabled: s3Enabled,
    encodeStorageKey,
    decodeStorageKey,
    putTenantMediaObject,
    getTenantMediaStream,
    getSignedTenantMediaUrl,
  };
}

module.exports = {
  createMediaStorage,
};
