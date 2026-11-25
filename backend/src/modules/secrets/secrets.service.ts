import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CryptographyService } from '../cryptography/cryptography.service';
import { AuditService } from '../audit/audit.service';
import { checksumOf } from '../../shared/crypto/envelope';
import type {
  CreateSecretVersionDto,
  SecretEnvelopeDto,
} from './dto/secrets.dto';

const ENVELOPE_ALGORITHM = 'curve25519/aes256/sha256';

@Injectable()
export class SecretsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly cryptography: CryptographyService,
    private readonly audit: AuditService,
  ) {}

  async listReaderUserIds(resourceId: string): Promise<string[]> {
    const permissions = await this.prisma.resourcePermission.findMany({
      where: { resourceId },
      select: { aroType: true, aroId: true },
    });

    const directUserIds = permissions
      .filter((permission) => permission.aroType === 'USER')
      .map((permission) => permission.aroId);
    const groupIds = permissions
      .filter((permission) => permission.aroType === 'GROUP')
      .map((permission) => permission.aroId);

    const userIds = new Set(directUserIds);
    if (groupIds.length > 0) {
      const members = await this.prisma.groupMember.findMany({
        where: {
          groupId: { in: groupIds },
          removedAt: null,
          group: { deletedAt: null },
        },
        select: { userId: true },
      });
      for (const member of members) {
        userIds.add(member.userId);
      }
    }

    if (userIds.size === 0) {
      return [];
    }

    const activeUsers = await this.prisma.user.findMany({
      where: {
        id: { in: [...userIds] },
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return activeUsers.map((user) => user.id);
  }

  async getCurrent(userId: string, resourceId: string) {
    await this.permissions.assertCan(
      userId,
      { type: 'RESOURCE', id: resourceId },
      'READ',
    );

    const secret = await this.prisma.resourceSecret.findFirst({
      where: { resourceId, isCurrent: true, deletedAt: null },
      include: {
        recipients: {
          where: { userId },
          select: {
            armoredMessage: true,
            keyFingerprint: true,
            signature: true,
            algorithm: true,
            formatVersion: true,
          },
        },
      },
    });

    if (!secret) {
      throw new NotFoundException('No secret version available');
    }
    const envelope = secret.recipients[0];
    if (!envelope) {
      throw new ForbiddenException('No envelope available for this user');
    }

    await this.audit.record({
      actorId: userId,
      action: 'secret.accessed',
      targetType: 'RESOURCE',
      targetId: resourceId,
      metadata: { version: secret.version },
    });

    return {
      version: secret.version,
      formatVersion: secret.formatVersion,
      keyFingerprint: envelope.keyFingerprint,
      armoredMessage: envelope.armoredMessage,
      ...(envelope.signature ? { signature: envelope.signature } : {}),
    };
  }

  async getVersion(userId: string, resourceId: string, version: number) {
    await this.permissions.assertCan(
      userId,
      { type: 'RESOURCE', id: resourceId },
      'READ',
    );

    const secret = await this.prisma.resourceSecret.findFirst({
      where: { resourceId, version, deletedAt: null },
      include: {
        recipients: {
          where: { userId },
          select: {
            armoredMessage: true,
            keyFingerprint: true,
            signature: true,
          },
        },
      },
    });

    if (!secret) {
      throw new NotFoundException('Secret version not found');
    }
    const envelope = secret.recipients[0];
    if (!envelope) {
      throw new ForbiddenException('No envelope available for this user');
    }

    await this.audit.record({
      actorId: userId,
      action: 'secret.accessed',
      targetType: 'RESOURCE',
      targetId: resourceId,
      metadata: { version },
    });

    return {
      version: secret.version,
      formatVersion: secret.formatVersion,
      keyFingerprint: envelope.keyFingerprint,
      armoredMessage: envelope.armoredMessage,
      ...(envelope.signature ? { signature: envelope.signature } : {}),
    };
  }

  async listVersions(userId: string, resourceId: string) {
    await this.permissions.assertCan(
      userId,
      { type: 'RESOURCE', id: resourceId },
      'READ',
    );

    const versions = await this.prisma.resourceSecret.findMany({
      where: { resourceId, deletedAt: null },
      orderBy: { version: 'desc' },
      select: {
        version: true,
        formatVersion: true,
        createdAt: true,
        byteSize: true,
        isCurrent: true,
      },
    });
    return versions;
  }

  async createVersion(
    userId: string,
    resourceId: string,
    input: CreateSecretVersionDto,
  ) {
    await this.permissions.assertCan(
      userId,
      { type: 'RESOURCE', id: resourceId },
      'UPDATE',
    );
    await this.permissions.assertHasOwner(resourceId);

    const recipients = await this.listReaderUserIds(resourceId);
    if (recipients.length === 0) {
      throw new UnprocessableEntityException('Resource has no recipients');
    }

    const keys = await this.cryptography.getActiveKeys(recipients);
    const envelopeByUser = new Map<string, SecretEnvelopeDto>();
    for (const envelope of input.envelopes) {
      if (envelopeByUser.has(envelope.userId)) {
        throw new ConflictException(
          `Duplicate envelope for user ${envelope.userId}`,
        );
      }
      envelopeByUser.set(envelope.userId, envelope);
    }

    const recipientSet = new Set(recipients);
    for (const envelopeUserId of envelopeByUser.keys()) {
      if (!recipientSet.has(envelopeUserId)) {
        throw new UnprocessableEntityException(
          `Envelope is not for a recipient with access: ${envelopeUserId}`,
        );
      }
    }

    for (const recipientId of recipients) {
      const key = keys.get(recipientId);
      if (!key) {
        throw new UnprocessableEntityException(
          `No active public key for user ${recipientId}`,
        );
      }
      const envelope = envelopeByUser.get(recipientId);
      if (!envelope) {
        throw new UnprocessableEntityException(
          `Missing envelope for user ${recipientId}`,
        );
      }
      const validation = this.cryptography.validateEnvelope(envelope, key.fingerprint);
      if (!validation.ok) {
        throw new UnprocessableEntityException(
          `Invalid envelope for user ${recipientId}: ${validation.reason}`,
        );
      }
    }

    const totalBytes = input.envelopes.reduce(
      (sum, envelope) => sum + Buffer.byteLength(envelope.armoredMessage, 'utf8'),
      0,
    );
    if (totalBytes > 1024 * 1024) {
      throw new UnprocessableEntityException('Secret payload exceeds 1 MiB');
    }

    const checksum = checksumOf(
      input.envelopes
        .map((envelope) => envelope.armoredMessage)
        .sort()
        .join(''),
    );

    await this.prisma.$transaction(async (tx) => {
      // Trava a linha do recurso para serializar criações concorrentes de
      // versão no mesmo recurso, evitando corrida na restrição de unicidade.
      await tx.resource.update({
        where: { id: resourceId },
        data: { updatedById: userId },
      });

      // Aloca a versão dentro da transação (agora serializada pelo lock acima).
      const currentMax = await tx.resourceSecret.aggregate({
        where: { resourceId },
        _max: { version: true },
      });
      const nextVersion = (currentMax._max.version ?? 0) + 1;
      if (input.version !== nextVersion) {
        throw new ConflictException(
          `Expected version ${nextVersion}, received ${input.version}`,
        );
      }

      await tx.resourceSecret.updateMany({
        where: { resourceId, isCurrent: true },
        data: { isCurrent: false },
      });

      let secret;
      try {
        secret = await tx.resourceSecret.create({
          data: {
            resourceId,
            version: input.version,
            isCurrent: true,
            formatVersion: input.formatVersion,
            algorithm: ENVELOPE_ALGORITHM,
            byteSize: totalBytes,
            checksum,
            createdById: userId,
            recipients: {
              create: input.envelopes.map((envelope) => ({
                userId: envelope.userId,
                keyFingerprint: envelope.keyFingerprint,
                armoredMessage: envelope.armoredMessage,
                signature: envelope.signature ?? null,
                algorithm: ENVELOPE_ALGORITHM,
                formatVersion: input.formatVersion,
                checksum: envelope.checksum,
              })),
            },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            `Expected version ${nextVersion}, received ${input.version}`,
          );
        }
        throw error;
      }

      return secret;
    });

    await this.audit.record({
      actorId: userId,
      action: 'secret.version.created',
      targetType: 'RESOURCE',
      targetId: resourceId,
      metadata: {
        version: input.version,
        formatVersion: input.formatVersion,
        recipients: input.envelopes.length,
      },
    });

    return {
      version: input.version,
      formatVersion: input.formatVersion,
      byteSize: totalBytes,
      createdAt: new Date(),
    };
  }

  async deleteCurrentEnvelopes(
    tx: Prisma.TransactionClient,
    resourceId: string,
    userId: string,
  ): Promise<void> {
    const secret = await tx.resourceSecret.findFirst({
      where: { resourceId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!secret) {
      return;
    }
    await tx.resourceSecretRecipient.deleteMany({
      where: { resourceSecretId: secret.id, userId },
    });
  }

  async upsertCurrentEnvelope(
    tx: Prisma.TransactionClient,
    resourceId: string,
    envelope: SecretEnvelopeDto,
  ): Promise<void> {
    const secret = await tx.resourceSecret.findFirst({
      where: { resourceId, isCurrent: true, deletedAt: null },
      select: { id: true, formatVersion: true },
    });
    if (!secret) {
      return;
    }
    const data = {
      keyFingerprint: envelope.keyFingerprint,
      armoredMessage: envelope.armoredMessage,
      signature: envelope.signature ?? null,
      checksum: envelope.checksum,
    };
    await tx.resourceSecretRecipient.upsert({
      where: {
        resourceSecretId_userId: {
          resourceSecretId: secret.id,
          userId: envelope.userId,
        },
      },
      create: {
        resourceSecretId: secret.id,
        userId: envelope.userId,
        algorithm: ENVELOPE_ALGORITHM,
        formatVersion: secret.formatVersion,
        ...data,
      },
      update: data,
    });
  }
}