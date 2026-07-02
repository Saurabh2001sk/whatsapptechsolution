import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key = Buffer.from(env.tokenEncryptionKey, 'base64');

  encrypt(value: string) {
    if (this.key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes base64');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(value: string) {
    if (this.key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes base64');
    }

    const [ivText, authTagText, encryptedText] = value.split('.');

    if (!ivText || !authTagText || !encryptedText) {
      throw new Error('Invalid encrypted value');
    }

    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(ivText, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(authTagText, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}