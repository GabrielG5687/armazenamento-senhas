import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, SharingOperation } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CryptographyService } from '../cryptography/cryptography.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { SecretsService } from '../secrets/secrets.service';
import type { PermissionRecipientDto } from '../../shared/dto/permission.dto';
import type { SecretEnvelopeDto } from '../secrets/dto/secrets.dto';
import type {
  CompleteRekeyDto,
  RevokeDto,
  ShareDto,
} from './dto/sharing.dto';

interface GroupRekeyPayload {
  groupId: string;
  userId: string;
  resourceIds: string[];
  [key: string]: unknown;
}

interface SharePayload {
  recipients: Array<{ type: 'USER' | 'GROUP'; id: string; level: string }>;
  [key: string]: unknown;
}

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly cryptography: CryptographyService,
    private readonly secrets: SecretsService,
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  async share(actorId: string, input: ShareDto) {
    await this.permissions.assertCan(
      actorId,
      { type: 'RESOURCE', id: input.resourceId },
      'SHARE',
    );

    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const existing = await this.prisma.sharingOperation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.actorId !== actorId) {
        throw new ConflictException('Idempotency key already used');
      }
      return this.view(existing);
    }

    const recipients = this.uniqueRecipients(input.recipients);
    await this.validateRecipients(recipients);

    const currentSecret = await this.prisma.resourceSecret.findFirst({
      where: { resourceId: input.resourceId, isCurrent: true, deletedAt: null },
      select: {
        id: true,
        recipients: { select: { userId: true } },
      },
    });
    const existingEnvelopeUsers = new Set(
      currentSecret?.recipients.map((recipient) => recipient.userId) ?? [],
    );

    const targetUsers = await this.collectTargetUsers(recipients);
    const keys = await this.cryptography.getActiveKeys([...targetUsers]);
    this.validateEnvelopes(input.envelopes, targetUsers, keys);

    if (currentSecret) {
      for (const userId of targetUsers) {
        if (
          !existingEnvelopeUsers.has(userId) &&
          !input.envelopes.some((envelope) => envelope.userId === userId)
        ) {
          throw new UnprocessableEntityException(
            `Missing envelope for recipient ${userId}`,
          );
        }
      }
    }

    const operation = await this.prisma.$transaction(async (tx) => {
      for (const recipient of recipients) {
        await tx.resourcePermission.upsert({
          where: {
            resourceId_aroType_aroId: {
              resourceId: input.resourceId,
              aroType: recipient.type,
              aroId: recipient.id,
            },
          },
          create: {
            resourceId: input.resourceId,
            aroType: recipient.type,
            aroId: recipient.id,
            level: recipient.level,
            createdById: actorId,
          },
          update: { level: recipient.level },
        });
      }

      for (const envelope of input.envelopes) {
        await this.secrets.upsertCurrentEnvelope(tx, input.resourceId, envelope);
      }

      const payload: SharePayload = {
        recipients: recipients.map((recipient) => ({
          type: recipient.type,
          id: recipient.id,
          level: recipient.level,
        })),
      };

      return tx.sharingOperation.create({
        data: {
          operation: 'SHARE',
          actorId,
          resourceId: input.resourceId,
          status: 'COMPLETED',
          idempotencyKey,
          payload: payload as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          completedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'sharing.completed',
      targetType: 'RESOURCE',
      targetId: input.resourceId,
      metadata: {
        operationId: operation.id,
        recipients: recipients.length,
        envelopes: input.envelopes.length,
      },
    });

    return this.view(operation);
  }

  async revoke(actorId: string, input: RevokeDto) {
    await this.permissions.assertCan(
      actorId,
      { type: 'RESOURCE', id: input.resourceId },
      'SHARE',
    );

    const existing = await this.prisma.resourcePermission.findFirst({
      where: {
        resourceId: input.resourceId,
        aroType: input.type,
        aroId: input.id,
      },
      select: { id: true, level: true },
    });
    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    if (existing.level === 'OWNER') {
      await this.permissions.assertOwnerRemains(input.resourceId, {
        type: input.type,
        id: input.id,
      });
    }

    const groupMemberIds =
      input.type === 'GROUP'
        ? await this.groups.listActiveMemberIds(input.id)
        : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.resourcePermission.deleteMany({
        where: {
          resourceId: input.resourceId,
          aroType: input.type,
          aroId: input.id,
        },
      });

      return tx.sharingOperation.create({
        data: {
          operation: 'UNSHARE',
          actorId,
          resourceId: input.resourceId,
          status: 'COMPLETED',
          idempotencyKey: randomUUID(),
          payload: {
            type: input.type,
            id: input.id,
            level: existing.level,
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          completedAt: new Date(),
        },
      });
    });

    if (input.type === 'USER') {
      await this.pruneUserEnvelope(input.resourceId, input.id);
    } else {
      for (const memberId of groupMemberIds) {
        await this.pruneUserEnvelope(input.resourceId, memberId);
      }
    }

    await this.audit.record({
      actorId,
      action: 'sharing.revoked',
      targetType: 'RESOURCE',
      targetId: input.resourceId,
      metadata: { type: input.type, id: input.id, level: existing.level },
    });

    return { resourceId: input.resourceId, type: input.type, id: input.id };
  }

  async completeRekey(actorId: string, operationId: string, input: CompleteRekeyDto) {
    const operation = await this.prisma.sharingOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) {
      throw new NotFoundException('Operation not found');
    }
    if (operation.status !== 'PENDING' && operation.status !== 'IN_PROGRESS') {
      throw new ConflictException('Operation is not pending');
    }
    if (operation.expiresAt.getTime() <= Date.now()) {
      await this.prisma.sharingOperation.update({
        where: { id: operationId },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('Operation expired');
    }

    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, deletedAt: null },
      select: { role: true },
    });
    const isAdmin = actor?.role === 'ADMIN';
    const isGroupManager =
      operation.groupId !== null &&
      (await this.groups.isManager(actorId, operation.groupId));

    if (operation.actorId !== actorId && !isAdmin && !isGroupManager) {
      throw new ForbiddenException('You cannot complete this operation');
    }

    if (operation.operation === 'GROUP_REKEY') {
      return this.completeGroupRekey(actorId, operation, input);
    }

    return this.completeGenericRekey(actorId, operation, input);
  }

  async listPending(userId: string) {
    const managedGroups = await this.prisma.groupMember.findMany({
      where: {
        userId,
        role: 'MANAGER',
        removedAt: null,
        group: { deletedAt: null },
      },
      select: { groupId: true },
    });
    const ownedResources = await this.prisma.resourcePermission.findMany({
      where: { aroType: 'USER', aroId: userId, level: 'OWNER' },
      select: { resourceId: true },
    });

    const operations = await this.prisma.sharingOperation.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        expiresAt: { gt: new Date() },
        OR: [
          { actorId: userId },
          ...(managedGroups.length > 0
            ? [
                {
                  groupId: {
                    in: managedGroups.map((membership) => membership.groupId),
                  },
                },
              ]
            : []),
          ...(ownedResources.length > 0
            ? [
                {
                  resourceId: {
                    in: ownedResources.map((row) => row.resourceId),
                  },
                },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(operations.map((operation) => this.view(operation)));
  }

  async getOperation(userId: string, operationId: string) {
    const operation = await this.prisma.sharingOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) {
      throw new NotFoundException('Operation not found');
    }
    await this.assertOperationVisible(userId, operation);
    return this.view(operation);
  }

  private async completeGroupRekey(
    actorId: string,
    operation: SharingOperation,
    input: CompleteRekeyDto,
  ) {
    const payload = operation.payload as unknown as GroupRekeyPayload;
    if (!payload?.groupId || !payload?.userId || !Array.isArray(payload.resourceIds)) {
      throw new ConflictException('Invalid group rekey payload');
    }

    const expected = new Set(payload.resourceIds);
    const received = new Set(input.items.map((item) => item.resourceId));
    for (const resourceId of expected) {
      if (!received.has(resourceId)) {
        throw new UnprocessableEntityException(
          `Missing rekey item for resource ${resourceId}`,
        );
      }
    }
    for (const resourceId of received) {
      if (!expected.has(resourceId)) {
        throw new UnprocessableEntityException(
          `Unexpected resource ${resourceId}`,
        );
      }
    }

    const key = await this.cryptography.getActiveKey(payload.userId);
    if (!key) {
      throw new UnprocessableEntityException('Target user has no active public key');
    }

    for (const item of input.items) {
      this.validateEnvelopes(item.envelopes, new Set([payload.userId]), new Map([
        [payload.userId, key],
      ]));
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        for (const envelope of item.envelopes) {
          await this.secrets.upsertCurrentEnvelope(tx, item.resourceId, envelope);
        }
        await tx.sharingOperationItem.upsert({
          where: {
            operationId_resourceId: {
              operationId: operation.id,
              resourceId: item.resourceId,
            },
          },
          create: {
            operationId: operation.id,
            resourceId: item.resourceId,
            status: 'COMPLETED',
            envelopeCount: item.envelopes.length,
            completedAt: new Date(),
          },
          update: {
            status: 'COMPLETED',
            envelopeCount: item.envelopes.length,
            completedAt: new Date(),
          },
        });
      }

      await this.groups.addMemberInternal(
        actorId,
        payload.groupId,
        payload.userId,
        tx,
      );

      await tx.sharingOperation.update({
        where: { id: operation.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'sharing.rekey.completed',
      targetType: 'GROUP',
      targetId: payload.groupId,
      metadata: {
        operationId: operation.id,
        userId: payload.userId,
        resources: input.items.length,
      },
    });

    return this.getOperation(actorId, operation.id);
  }

  private async completeGenericRekey(
    actorId: string,
    operation: SharingOperation,
    input: CompleteRekeyDto,
  ) {
    const payload = operation.payload as unknown as SharePayload;
    const recipients = Array.isArray(payload?.recipients) ? payload.recipients : [];
    const targetUsers = await this.collectTargetUsers(
      recipients.map((recipient) => ({
        type: recipient.type,
        id: recipient.id,
        level: recipient.level as 'READ' | 'UPDATE' | 'OWNER',
      })),
    );
    const keys = await this.cryptography.getActiveKeys([...targetUsers]);

    await this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        this.validateEnvelopes(item.envelopes, targetUsers, keys);
        for (const envelope of item.envelopes) {
          await this.secrets.upsertCurrentEnvelope(tx, item.resourceId, envelope);
        }
        await tx.sharingOperationItem.upsert({
          where: {
            operationId_resourceId: {
              operationId: operation.id,
              resourceId: item.resourceId,
            },
          },
          create: {
            operationId: operation.id,
            resourceId: item.resourceId,
            status: 'COMPLETED',
            envelopeCount: item.envelopes.length,
            completedAt: new Date(),
          },
          update: {
            status: 'COMPLETED',
            envelopeCount: item.envelopes.length,
            completedAt: new Date(),
          },
        });
      }

      await tx.sharingOperation.update({
        where: { id: operation.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });

    await this.audit.record({
      actorId,
      action: 'sharing.rekey.completed',
      targetType: 'RESOURCE',
      targetId: operation.resourceId,
      metadata: { operationId: operation.id, resources: input.items.length },
    });

    return this.getOperation(actorId, operation.id);
  }

  private uniqueRecipients(
    recipients: PermissionRecipientDto[],
  ): PermissionRecipientDto[] {
    const seen = new Set<string>();
    const unique: PermissionRecipientDto[] = [];
    for (const recipient of recipients) {
      const key = `${recipient.type}:${recipient.id}`;
      if (seen.has(key)) {
        throw new ConflictException(`Duplicate recipient ${key}`);
      }
      seen.add(key);
      unique.push(recipient);
    }
    return unique;
  }

  private async validateRecipients(
    recipients: PermissionRecipientDto[],
  ): Promise<void> {
    for (const recipient of recipients) {
      if (recipient.type === 'USER') {
        const user = await this.prisma.user.findFirst({
          where: { id: recipient.id, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!user) {
          throw new UnprocessableEntityException(
            `Recipient user ${recipient.id} is not active`,
          );
        }
      } else {
        const group = await this.prisma.group.findFirst({
          where: { id: recipient.id, deletedAt: null },
          select: { id: true },
        });
        if (!group) {
          throw new UnprocessableEntityException(
            `Recipient group ${recipient.id} not found`,
          );
        }
      }
    }
  }

  private async collectTargetUsers(
    recipients: PermissionRecipientDto[],
  ): Promise<Set<string>> {
    const users = new Set<string>();
    for (const recipient of recipients) {
      if (recipient.type === 'USER') {
        users.add(recipient.id);
      } else {
        const memberIds = await this.groups.listActiveMemberIds(recipient.id);
        for (const memberId of memberIds) {
          users.add(memberId);
        }
      }
    }
    return users;
  }

  private validateEnvelopes(
    envelopes: SecretEnvelopeDto[],
    targetUsers: Set<string>,
    keys: Map<string, { fingerprint: string; armoredPublicKey: string }>,
  ): void {
    const seen = new Set<string>();
    for (const envelope of envelopes) {
      if (seen.has(envelope.userId)) {
        throw new ConflictException(
          `Duplicate envelope for user ${envelope.userId}`,
        );
      }
      seen.add(envelope.userId);
      if (!targetUsers.has(envelope.userId)) {
        throw new UnprocessableEntityException(
          `Envelope recipient ${envelope.userId} has no permission`,
        );
      }
      const key = keys.get(envelope.userId);
      if (!key) {
        throw new UnprocessableEntityException(
          `No active public key for user ${envelope.userId}`,
        );
      }
      const validation = this.cryptography.validateEnvelope(envelope, key.fingerprint);
      if (!validation.ok) {
        throw new UnprocessableEntityException(
          `Invalid envelope for user ${envelope.userId}: ${validation.reason}`,
        );
      }
    }
  }

  private async pruneUserEnvelope(resourceId: string, userId: string): Promise<void> {
    const level = await this.permissions.getResourceLevel(userId, resourceId);
    if (level !== null) {
      return;
    }
    const secret = await this.prisma.resourceSecret.findFirst({
      where: { resourceId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!secret) {
      return;
    }
    await this.prisma.resourceSecretRecipient.deleteMany({
      where: { resourceSecretId: secret.id, userId },
    });
  }

  private async assertOperationVisible(userId: string, operation: SharingOperation) {
    if (operation.actorId === userId) {
      return;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { role: true },
    });
    if (user?.role === 'ADMIN') {
      return;
    }
    if (operation.groupId && (await this.groups.isManager(userId, operation.groupId))) {
      return;
    }
    if (operation.resourceId) {
      const level = await this.permissions.getResourceLevel(userId, operation.resourceId);
      if (level === 'OWNER') {
        return;
      }
    }
    throw new ForbiddenException('You cannot view this operation');
  }

  private async view(operation: SharingOperation) {
    const items = await this.prisma.sharingOperationItem.findMany({
      where: { operationId: operation.id },
      select: {
        resourceId: true,
        status: true,
        envelopeCount: true,
        errorCode: true,
        completedAt: true,
      },
    });
    return {
      id: operation.id,
      operation: operation.operation,
      status: operation.status,
      actorId: operation.actorId,
      resourceId: operation.resourceId,
      groupId: operation.groupId,
      payload: operation.payload,
      items,
      errorCode: operation.errorCode,
      errorMessage: operation.errorMessage,
      createdAt: operation.createdAt,
      expiresAt: operation.expiresAt,
      completedAt: operation.completedAt,
    };
  }
}