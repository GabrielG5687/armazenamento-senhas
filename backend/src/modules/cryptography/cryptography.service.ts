import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readKey, readMessage } from 'openpgp';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  PGP_PRIVATE_KEY_BEGIN,
  validateEnvelopeShape,
  type EnvelopeLike,
  type EnvelopeValidationResult,
} from '../../shared/crypto/envelope';

export interface ValidatedPublicKey {
  fingerprint: string;
  keyId: string;
  algorithm: string;
  bits: number | null;
  keyType: 'ecc' | 'rsa';
  uid: string;
  expiresAt: Date | null;
}

export interface EnvelopeValidationRequest extends EnvelopeLike {
  signature?: string | null;
}

@Injectable()
export class CryptographyService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async validatePublicKey(armoredPublicKey: string): Promise<ValidatedPublicKey> {
    if (armoredPublicKey.includes(PGP_PRIVATE_KEY_BEGIN)) {
      throw new UnprocessableEntityException('Private keys are not accepted');
    }

    let key;
    try {
      key = await readKey({ armoredKey: armoredPublicKey });
    } catch {
      throw new UnprocessableEntityException('Invalid OpenPGP public key');
    }

    if (key.isPrivate()) {
      throw new UnprocessableEntityException('Private keys are not accepted');
    }

    if (await key.isRevoked()) {
      throw new UnprocessableEntityException('Revoked keys are not accepted');
    }

    try {
      await key.getEncryptionKey();
    } catch {
      throw new UnprocessableEntityException('Key is not encryption-capable');
    }

    const expiration = await key.getExpirationTime();
    let expiresAt: Date | null = null;
    if (expiration instanceof Date) {
      expiresAt = expiration;
    } else if (typeof expiration === 'number' && Number.isFinite(expiration)) {
      expiresAt = new Date(expiration * 1000);
    }
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('Key is expired');
    }

    const info = key.getAlgorithmInfo();
    const keyType: 'ecc' | 'rsa' = info.curve ? 'ecc' : 'rsa';

    return {
      fingerprint: key.getFingerprint(),
      keyId: key.getKeyID().toHex(),
      algorithm: info.algorithm,
      bits: info.bits ?? null,
      keyType,
      uid: key.getUserIDs()[0] ?? '',
      expiresAt,
    };
  }

  async getActiveKey(userId: string) {
    return this.prisma.userPublicKey.findFirst({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getActiveKeys(userIds: string[]) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map<string, { fingerprint: string; armoredPublicKey: string }>();
    }
    const keys = await this.prisma.userPublicKey.findMany({
      where: {
        userId: { in: unique },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
    const map = new Map<string, { fingerprint: string; armoredPublicKey: string }>();
    for (const key of keys) {
      if (!map.has(key.userId)) {
        map.set(key.userId, {
          fingerprint: key.fingerprint,
          armoredPublicKey: key.armoredPublicKey,
        });
      }
    }
    return map;
  }

  validateEnvelope(
    envelope: EnvelopeValidationRequest,
    expectedFingerprint?: string,
  ): EnvelopeValidationResult {
    const maxBytes = this.config.get<number>('maxEnvelopeBytes') ?? 256 * 1024;
    const shape = validateEnvelopeShape(envelope, {
      maxBytes,
      expectedFingerprint,
    });
    if (!shape.ok) {
      return shape;
    }

    try {
      readMessage({ armoredMessage: envelope.armoredMessage });
    } catch {
      return { ok: false, reason: 'INVALID_MESSAGE' };
    }

    if (envelope.signature && !envelope.signature.includes('-----BEGIN PGP SIGNATURE-----')) {
      return { ok: false, reason: 'INVALID_SIGNATURE_ARMOR' };
    }

    return { ok: true };
  }

  async getServerKey() {
    const configured = this.config.get<string>('serverPublicKey');
    const fingerprint = this.config.get<string>('serverKeyFingerprint');
    if (configured && fingerprint) {
      let algorithm = 'ed25519';
      try {
        const key = await readKey({ armoredKey: configured });
        algorithm = key.getAlgorithmInfo().algorithm;
      } catch {
        throw new BadRequestException('Configured SERVER_PUBLIC_KEY is invalid');
      }
      return {
        kid: fingerprint,
        fingerprint,
        armoredPublicKey: configured,
        algorithm,
      };
    }

    const stored = await this.prisma.serverPublicKey.findFirst({
      where: { isActive: true, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!stored) {
      return null;
    }
    return {
      kid: stored.kid,
      fingerprint: stored.fingerprint,
      armoredPublicKey: stored.armoredPublicKey,
      algorithm: stored.algorithm,
    };
  }
}
