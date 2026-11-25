import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import type { EffectivePermission } from '../permissions/permissions.service';
import type { PermissionLevelName } from '../../shared/permissions/permission-policy';
import type { PermissionRecipientDto } from '../../shared/dto/permission.dto';
import type {
  CreateFolderDto,
  UpdateFolderDto,
} from './dto/folders.dto';

const MAX_DEPTH = 10;

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string) {
    const groupIds = await this.permissions.getActiveGroupIds(userId);
    const folders = await this.prisma.folder.findMany({
      where: {
        deletedAt: null,
        OR: [
          { permissions: { some: { aroType: 'USER' as const, aroId: userId } } },
          ...(groupIds.length > 0
            ? [{ permissions: { some: { aroType: 'GROUP' as const, aroId: { in: groupIds } } } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        parentId: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const levels = new Map<string, PermissionLevelName | null>();
    for (const folder of folders) {
      levels.set(folder.id, await this.permissions.getFolderLevel(userId, folder.id));
    }

    return folders.map((folder) => ({
      ...folder,
      permission: levels.get(folder.id) ?? null,
    }));
  }

  async get(userId: string, id: string) {
    await this.permissions.assertCan(userId, { type: 'FOLDER', id }, 'READ');
    const folder = await this.prisma.folder.findFirst({
      where: { id, deletedAt: null },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return {
      ...folder,
      permission: await this.permissions.getFolderLevel(userId, id),
    };
  }

  async create(userId: string, input: CreateFolderDto) {
    if (input.parentId) {
      await this.permissions.assertCan(
        userId,
        { type: 'FOLDER', id: input.parentId },
        'UPDATE',
      );
    }

    await this.assertUniqueName(input.name, input.parentId ?? null, null);

    const folder = await this.prisma.folder.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
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

    await this.audit.record({
      actorId: userId,
      action: 'folder.created',
      targetType: 'FOLDER',
      targetId: folder.id,
      metadata: { parentId: input.parentId ?? null },
    });

    return { ...folder, permission: 'OWNER' as PermissionLevelName };
  }

  async update(userId: string, id: string, input: UpdateFolderDto) {
    await this.permissions.assertCan(userId, { type: 'FOLDER', id }, 'UPDATE');

    const current = await this.prisma.folder.findFirst({
      where: { id, deletedAt: null },
      select: { name: true, parentId: true },
    });
    if (!current) {
      throw new NotFoundException('Folder not found');
    }

    if (input.parentId !== undefined) {
      await this.assertNoCycle(id, input.parentId);
      if (input.parentId) {
        await this.permissions.assertCan(
          userId,
          { type: 'FOLDER', id: input.parentId },
          'UPDATE',
        );
      }
    }

    const nextParent = input.parentId !== undefined ? input.parentId : current.parentId;
    const nextName = input.name ?? current.name;
    if (input.name !== undefined || input.parentId !== undefined) {
      await this.assertUniqueName(nextName, nextParent, id);
    }

    const folder = await this.prisma.folder.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(nextParent !== undefined ? { parentId: nextParent } : {}),
        updatedById: userId,
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'folder.updated',
      targetType: 'FOLDER',
      targetId: id,
      metadata: {
        changedFields: Object.keys(input),
      },
    });

    return folder;
  }

  async move(userId: string, id: string, parentId: string) {
    return this.update(userId, id, { parentId });
  }

  async remove(userId: string, id: string) {
    await this.permissions.assertCan(userId, { type: 'FOLDER', id }, 'UPDATE');

    const [children, items] = await Promise.all([
      this.prisma.folder.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.folderResource.count({ where: { folderId: id, removedAt: null } }),
    ]);
    if (children > 0 || items > 0) {
      throw new ConflictException('Folder is not empty');
    }

    const folder = await this.prisma.folder.findFirst({
      where: { id, deletedAt: null },
      select: { name: true },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    await this.prisma.folder.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });

    await this.audit.record({
      actorId: userId,
      action: 'folder.deleted',
      targetType: 'FOLDER',
      targetId: id,
      metadata: { name: folder.name },
    });
  }

  async listPermissions(userId: string, id: string): Promise<EffectivePermission[]> {
    await this.permissions.assertCan(userId, { type: 'FOLDER', id }, 'READ');
    return this.permissions.listEffectivePermissions({ type: 'FOLDER', id });
  }

  async setPermissions(
    userId: string,
    id: string,
    recipients: PermissionRecipientDto[],
  ) {
    await this.permissions.assertCan(userId, { type: 'FOLDER', id }, 'SHARE');

    await this.prisma.$transaction(async (tx) => {
      await this.validateRecipients(recipients, tx);
      await this.replaceFolderPermissions(id, userId, recipients, tx);
    });

    await this.applyMaskToResources(id, userId);
    await this.audit.record({
      actorId: userId,
      action: 'folder.permissions.updated',
      targetType: 'FOLDER',
      targetId: id,
      metadata: { recipients: recipients.length },
    });

    return this.permissions.listEffectivePermissions({ type: 'FOLDER', id });
  }

  async assertNoCycle(folderId: string, newParentId: string | null): Promise<void> {
    if (!newParentId) {
      return;
    }
    if (newParentId === folderId) {
      throw new ConflictException('A folder cannot be its own parent');
    }

    let cursor: string | null = newParentId;
    let visited = 0;
    while (cursor) {
      if (cursor === folderId) {
        throw new ConflictException('Folder hierarchy would create a cycle');
      }
      const parent: { parentId: string | null } | null =
        await this.prisma.folder.findFirst({
          where: { id: cursor, deletedAt: null },
          select: { parentId: true },
        });
      if (!parent) {
        throw new NotFoundException('Parent folder not found');
      }
      cursor = parent.parentId;
      visited += 1;
      if (visited > MAX_DEPTH) {
        throw new ConflictException('Maximum folder depth exceeded');
      }
    }
  }

  async getFolderDepth(folderId: string): Promise<number> {
    let depth = 1;
    let cursor = await this.prisma.folder.findFirst({
      where: { id: folderId, deletedAt: null },
      select: { parentId: true },
    });
    while (cursor?.parentId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: cursor.parentId, deletedAt: null },
        select: { parentId: true },
      });
      if (!parent) {
        break;
      }
      cursor = parent;
      depth += 1;
      if (depth > MAX_DEPTH) {
        throw new ConflictException('Maximum folder depth exceeded');
      }
    }
    return depth;
  }

  async applyMaskToResources(folderId: string, actorId: string): Promise<void> {
    const folderPermissions = await this.prisma.folderPermission.findMany({
      where: { folderId },
      select: { aroType: true, aroId: true, level: true },
    });
    if (folderPermissions.length === 0) {
      return;
    }

    const items = await this.prisma.folderResource.findMany({
      where: { folderId, removedAt: null, resource: { deletedAt: null } },
      select: { resourceId: true },
    });

    for (const item of items) {
      const actorLevel = await this.permissions.getResourceLevel(actorId, item.resourceId);
      if (actorLevel !== 'OWNER') {
        continue;
      }
      for (const permission of folderPermissions) {
        if (permission.aroType === 'USER' && permission.aroId === actorId) {
          continue;
        }
        await this.prisma.resourcePermission.upsert({
          where: {
            resourceId_aroType_aroId: {
              resourceId: item.resourceId,
              aroType: permission.aroType,
              aroId: permission.aroId,
            },
          },
          create: {
            resourceId: item.resourceId,
            aroType: permission.aroType,
            aroId: permission.aroId,
            level: permission.level,
            createdById: actorId,
          },
          update: { level: permission.level },
        });
      }
    }
  }

  private async replaceFolderPermissions(
    folderId: string,
    actorId: string,
    recipients: PermissionRecipientDto[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ownerKeys = recipients
      .filter((recipient) => recipient.level === 'OWNER')
      .map((recipient) => `${recipient.type}:${recipient.id}`);
    if (ownerKeys.length === 0) {
      const existingOwners = await tx.folderPermission.findMany({
        where: { folderId, level: 'OWNER' },
        select: { aroType: true, aroId: true },
      });
      if (existingOwners.length === 0) {
        throw new ForbiddenException('Folder must keep at least one OWNER');
      }
    }

    await tx.folderPermission.deleteMany({ where: { folderId } });
    for (const recipient of recipients) {
      await tx.folderPermission.create({
        data: {
          folderId,
          aroType: recipient.type,
          aroId: recipient.id,
          level: recipient.level,
          createdById: actorId,
        },
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
          where: { id: recipient.id, deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] } },
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

  private async assertUniqueName(
    name: string | undefined,
    parentId: string | null | undefined,
    ignoreId: string | null,
  ): Promise<void> {
    if (!name) {
      return;
    }
    const duplicate = await this.prisma.folder.findFirst({
      where: {
        name,
        parentId: parentId ?? null,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Folder name already used in this parent');
    }
  }
}
