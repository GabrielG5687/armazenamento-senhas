import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class TotpCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configured = config.get<string>('totpEncKey');
    if (configured) {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length !== 32) {
        throw new Error('TOTP_ENC_KEY must decode to exactly 32 bytes');
      }
      this.key = decoded;
    } else {
      this.key = createHash('sha256')
        .update(config.get<string>('jwtSecret') ?? 'securevault-dev')
        .digest();
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload');
    }
    const [ivPart, tagPart, dataPart] = parts;
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}