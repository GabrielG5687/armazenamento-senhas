import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import {
  maxLevel,
  type PermissionLevelName,
} from '../../shared/permissions/permission-policy';
import { encodeCursor, decodeCursor } from '../../shared/utils/pagination';
import type { PermissionRecipientDto } from '../../shared/dto/permission.dto';
import type {
  CreateResourceDto,
  ListResourcesQueryDto,
  UpdateResourceDto,
} from './dto/resources.dto';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: ListResourcesQueryDto) {
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const groupIds = await this.permissions.getActiveGroupIds(userId);
    const cursor = decodeCursor(query.cursor);

    const conditions: Prisma.ResourceWhereInput[] = [
      { deletedAt: null },
      { status: { not: 'TRASHED' } },
      {
        OR: [
          { permissions: { some: { aroType: 'USER' as const, aroId: userId } } },
          ...(groupIds.length > 0
            ? [{ permissions: { some: { aroType: 'GROUP' as const, aroId: { in: groupIds } } } }]
            : []),
        ],
      },
    ];

    if (query.q) {
      conditions.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { username: { contains: query.q, mode: 'insensitive' } },
          { uri: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.type) {
      conditions.push({ resourceType: { slug: query.type } });
    }
    if (query.folderId) {
      conditions.push({
        folderItems: { some: { folderId: query.folderId, removedAt: null } },
      });
    }
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new ConflictException('Invalid cursor');
      }
      conditions.push({
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.resource.findMany({
      where: { AND: conditions },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      include: { resourceType: { select: { slug: true, name: true } } },
    });

    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const levels = await this.levelsForResources(
      userId,
      groupIds,
      items.map((item) => item.id),
    );

    const last = items[items.length - 1];
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        username: item.username,
        uri: item.uri,
        description: item.description,
        status: item.status,
        resourceType: item.resourceType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        permission: levels.get(item.id) ?? null,
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(userId: string, id: string) {
    await this.permissions.assertCan(userId, { type: 'RESOURCE', id }, 'READ');

    const resource = await this.prisma.resource.findFirst({
      where: { id, deletedAt: null },
      include: {
        resourceType: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    const [permission, secret, folderItem] = await Promise.all([
      this.permissions.getResourceLevel(userId, id),
      this.prisma.resourceSecret.findFirst({
        where: { resourceId: id, isCurrent: true, deletedAt: null },
        select: { version: true, formatVersion: true, createdAt: true, byteSize: true },
      }),
      this.prisma.folderResource.findFirst({
        where: { resourceId: id, removedAt: null },
        select: { folderId: true },
      }),
    ]);

    return {
      id: resource.id,
      name: resource.name,
      username: resource.username,
      uri: resource.uri,
      description: resource.description,
      status: resource.status,
      resourceType: resource.resourceType,
      metadata: resource.metadata,
      folderId: folderItem?.folderId ?? null,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      permission,
      secret: secret
        ? {
            version: secret.version,
            formatVersion: secret.formatVersion,
            byteSize: secret.byteSize,
            createdAt: secret.createdAt,
          }
        : null,
    };
  }

  async create(userId: string, input: CreateResourceDto) {
    const resourceType = await this.prisma.resourceType.findFirst({
      where: { id: input.resourceTypeId, isActive: true },
      select: { id: true, currentVersion: true },
    });
    if (!resourceType) {
      throw new UnprocessableEntityException('Resource type not found');
    }

    if (input.folderId) {
      await this.permissions.assertCan(
        userId,
        { type: 'FOLDER', id: input.folderId },
        'UPDATE',
      );
    }

    const resource = await this.prisma.$transaction(async (tx) => {
      const created = await tx.resource.create({
        data: {
          name: input.name,
          username: input.username ?? null,
          uri: input.uri ?? null,
          description: input.description ?? null,
          resourceTypeId: resourceType.id,
          resourceTypeVersion: resourceType.currentVersion,
          createdById: userId,
          updatedById: userId,
          permissions: {
            create: {
              aroType: 'USER',
              aroId: userId,
              level: 'OWNER',
              createdById: userId,
            },
          },
        },
      });

      if (input.folderId) {
        await tx.folderResource.create({
          data: {
            folderId: input.folderId,
            resourceId: created.id,
            addedById: userId,
          },
        });
        await this.applyFolderMask(tx, input.folderId, created.id, userId);
      }

      return created;
    });

    await this.audit.record({
      actorId: userId,
      action: 'resource.created',
      targetType: 'RESOURCE',
      targetId: resource.id,
      metadata: {
        resourceTypeId: resource.resourceTypeId,
        folderId: input.folderId ?? null,
      },
    });

    return this.get(userId, resource.id);
  }

  async update(userId: string, id: string, input: UpdateResourceDto) {
    await this.permissions.assertCan(userId, { type: 'RESOURCE', id }, 'UPDATE');

    const current = await this.prisma.resource.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, resourceTypeId: true },
    });
    if (!current) {
      throw new NotFoundException('Resource not found');
    }

    let resourceTypeVersion: number | undefined;
    if (input.resourceTypeId && input.resourceTypeId !== current.resourceTypeId) {
      const resourceType = await this.prisma.resourceType.findFirst({
        where: { id: input.resourceTypeId, isActive: true },
        select: { currentVersion: true },
      });
      if (!resourceType) {
        throw new UnprocessableEntityException('Resource type not found');
      }
      resourceTypeVersion = resourceType.currentVersion;
    }

    const existingFolder = await this.prisma.folderResource.findFirst({
      where: { resourceId: id, removedAt: null },
      select: { folderId: true },
    });
    const moving =
      input.folderId !== undefined &&
      (input.folderId ?? null) !== (existingFolder?.folderId ?? null);

    if (input.folderId) {
      await this.permissions.assertCan(
        userId,
        { type: 'FOLDER', id: input.folderId },
        'UPDATE',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (moving) {
        await tx.folderResource.updateMany({
          where: { resourceId: id, removedAt: null },
          data: { removedAt: new Date() },
        });
        if (input.folderId) {
          await tx.folderResource.create({
            data: {
              folderId: input.folderId,
              resourceId: id,
              addedById: userId,
            },
          });
          await this.applyFolderMask(tx, input.folderId, id, userId);
        }
      }

      await tx.resource.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.uri !== undefined ? { uri: input.uri } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.resourceTypeId !== undefined
            ? { resourceTypeId: input.resourceTypeId }
            : {}),
          ...(resourceTypeVersion !== undefined
            ? { resourceTypeVersion }
            : {}),
          updatedById: userId,
        },
      });
    });

    await this.audit.record({
      actorId: userId,
      action: 'resource.updated',
      targetType: 'RESOURCE',
      targetId: id,
      metadata: { changedFields: Object.keys(input) },
    });

    return this.get(userId, id);
  }

  async move(userId: string, id: string, folderId: string) {
    return this.update(userId, id, { folderId });
  }

  async remove(userId: string, id: string) {
    await this.permissions.assertCan(userId, { type: 'RESOURCE', id }, 'UPDATE');

    await this.prisma.$transaction(async (tx) => {
      const currentSecret = await tx.resourceSecret.findFirst({
        where: { resourceId: id, isCurrent: true, deletedAt: null },
        select: { id: true },
      });
      if (currentSecret) {
        await tx.resourceSecretRecipient.deleteMany({
          where: { resourceSecretId: currentSecret.id },
        });
        await tx.resourceSecret.update({
          where: { id: currentSecret.id },
          data: { isCurrent: false, deletedAt: new Date() },
        });
      }

      await tx.folderResource.updateMany({
        where: { resourceId: id, removedAt: null },
        data: { removedAt: new Date() },
      });

      await tx.resource.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'TRASHED', updatedById: userId },
      });
    });

    await this.audit.record({
      actorId: userId,
      action: 'resource.deleted',
      targetType: 'RESOURCE',
      targetId: id,
    });
  }

  async listPermissions(userId: string, id: string) {
    await this.permissions.assertCan(userId, { type: 'RESOURCE', id }, 'READ');
    return this.permissions.listEffectivePermissions({ type: 'RESOURCE', id });
  }

  async setPermissions(
    userId: string,
    id: string,
    recipients: PermissionRecipientDto[],
  ) {
    await this.permissions.assertCan(userId, { type: 'RESOURCE', id }, 'SHARE');

    const owners = recipients.filter((recipient) => recipient.level === 'OWNER');
    if (owners.length === 0) {
      throw new ConflictException('Resource must keep at least one OWNER');
    }

    const existing = await this.prisma.resourcePermission.findMany({
      where: { resourceId: id },
      select: { id: true, aroType: true, aroId: true, level: true },
    });

    const nextKeys = new Set(
      recipients.map((recipient) => `${recipient.type}:${recipient.id}`),
    );
    const losingRead = existing.filter((permission) => {
      if (permission.aroType !== 'USER') {
        return false;
      }
      const next = recipients.find(
        (recipient) =>
          recipient.type === 'USER' && recipient.id === permission.aroId,
      );
      return !next;
    });

    await this.prisma.$transaction(async (tx) => {
      await this.validateRecipients(recipients, tx);
      await tx.resourcePermission.deleteMany({ where: { resourceId: id } });
      for (const recipient of recipients) {
        await tx.resourcePermission.create({
          data: {
            resourceId: id,
            aroType: recipient.type,
            aroId: recipient.id,
            level: recipient.level,
            createdById: userId,
          },
        });
      }

      for (const permission of losingRead) {
        await this.deleteCurrentEnvelopes(tx, id, permission.aroId);
      }
    });

    await this.audit.record({
      actorId: userId,
      action: 'permission.updated',
      targetType: 'RESOURCE',
      targetId: id,
      metadata: {
        recipients: recipients.map((recipient) => ({
          type: recipient.type,
          id: recipient.id,
          level: recipient.level,
        })),
        previous: existing.map((permission) => ({
          type: permission.aroType,
          id: permission.aroId,
          level: permission.level,
        })),
      },
    });

    return this.permissions.listEffectivePermissions({ type: 'RESOURCE', id });
  }

  private async levelsForResources(
    userId: string,
    groupIds: string[],
    resourceIds: string[],
  ): Promise<Map<string, PermissionLevelName>> {
    const map = new Map<string, PermissionLevelName>();
    if (resourceIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.resourcePermission.findMany({
      where: {
        resourceId: { in: resourceIds },
        OR: [
          { aroType: 'USER', aroId: userId },
          ...(groupIds.length > 0
            ? [{ aroType: 'GROUP' as const, aroId: { in: groupIds } }]
            : []),
        ],
      },
      select: { resourceId: true, level: true },
    });
    for (const row of rows) {
      const current = map.get(row.resourceId);
      const merged = maxLevel(
        [...(current ? [current] : []), row.level as PermissionLevelName],
      );
      if (merged) {
        map.set(row.resourceId, merged);
      }
    }
    return map;
  }

  private async applyFolderMask(
    tx: Prisma.TransactionClient,
    folderId: string,
    resourceId: string,
    actorId: string,
  ): Promise<void> {
    const folderPermissions = await tx.folderPermission.findMany({
      where: { folderId },
      select: { aroType: true, aroId: true, level: true },
    });
    for (const permission of folderPermissions) {
      if (permission.aroType === 'USER' && permission.aroId === actorId) {
        continue;
      }
      await tx.resourcePermission.upsert({
        where: {
          resourceId_aroType_aroId: {
            resourceId,
            aroType: permission.aroType,
            aroId: permission.aroId,
          },
        },
        create: {
          resourceId,
          aroType: permission.aroType,
          aroId: permission.aroId,
          level: permission.level,
          createdById: actorId,
        },
        update: { level: permission.level },
      });
    }
  }

  private async validateRecipients(
    recipients: PermissionRecipientDto[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const unique = new Set<string>();
    for (const recipient of recipients) {
      const key = `${recipient.type}:${recipient.id}`;
      if (unique.has(key)) {
        throw new ConflictException(`Duplicate recipient ${key}`);
      }
      unique.add(key);
      if (recipient.type === 'USER') {
        const user = await tx.user.findFirst({
          where: { id: recipient.id, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException(`User ${recipient.id} not found`);
        }
      } else {
        const group = await tx.group.findFirst({
          where: { id: recipient.id, deletedAt: null },
          select: { id: true },
        });
        if (!group) {
          throw new NotFoundException(`Group ${recipient.id} not found`);
        }
      }
    }
  }

  private async deleteCurrentEnvelopes(
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
}
