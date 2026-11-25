import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PermissionLevel } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  isAllowed,
  maxLevel,
  canRemoveOwner,
  type PermissionActionName,
  type PermissionLevelName,
} from '../../shared/permissions/permission-policy';
import type { AcoRef } from '../../shared/types';

export interface EffectivePermission {
  type: 'USER' | 'GROUP';
  id: string;
  level: PermissionLevelName;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertUserActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { status: true },
    });
    if (!user || user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new ForbiddenException('Account is not active');
    }
  }

  async getActiveGroupIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, removedAt: null, group: { deletedAt: null } },
      select: { groupId: true },
    });
    return memberships.map((membership) => membership.groupId);
  }

  async getResourceLevel(userId: string, resourceId: string): Promise<PermissionLevelName | null> {
    const groupIds = await this.getActiveGroupIds(userId);
    const rows = await this.prisma.resourcePermission.findMany({
      where: {
        resourceId,
        OR: [
          { aroType: 'USER', aroId: userId },
          ...(groupIds.length > 0
            ? [{ aroType: 'GROUP' as const, aroId: { in: groupIds } }]
            : []),
        ],
      },
      select: { level: true },
    });
    return maxLevel(rows.map((row) => row.level as PermissionLevelName));
  }

  async getFolderLevel(userId: string, folderId: string): Promise<PermissionLevelName | null> {
    const groupIds = await this.getActiveGroupIds(userId);
    const rows = await this.prisma.folderPermission.findMany({
      where: {
        folderId,
        OR: [
          { aroType: 'USER', aroId: userId },
          ...(groupIds.length > 0
            ? [{ aroType: 'GROUP' as const, aroId: { in: groupIds } }]
            : []),
        ],
      },
      select: { level: true },
    });
    return maxLevel(rows.map((row) => row.level as PermissionLevelName));
  }

  async getEffectiveLevel(userId: string, aco: AcoRef): Promise<PermissionLevelName | null> {
    return aco.type === 'RESOURCE'
      ? this.getResourceLevel(userId, aco.id)
      : this.getFolderLevel(userId, aco.id);
  }

  async can(userId: string, aco: AcoRef, action: PermissionActionName): Promise<boolean> {
    try {
      await this.assertCan(userId, aco, action);
      return true;
    } catch {
      return false;
    }
  }

  async assertCan(userId: string, aco: AcoRef, action: PermissionActionName): Promise<void> {
    await this.assertUserActive(userId);

    if (aco.type === 'RESOURCE') {
      const resource = await this.prisma.resource.findFirst({
        where: { id: aco.id, deletedAt: null },
        select: { id: true },
      });
      if (!resource) {
        throw new NotFoundException('Resource not found');
      }
      const level = await this.getResourceLevel(userId, aco.id);
      if (!isAllowed(level, action)) {
        throw new ForbiddenException('Permission denied');
      }
      return;
    }

    const folder = await this.prisma.folder.findFirst({
      where: { id: aco.id, deletedAt: null },
      select: { id: true },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    const level = await this.getFolderLevel(userId, aco.id);
    if (!isAllowed(level, action)) {
      throw new ForbiddenException('Permission denied');
    }
  }

  async listEffectivePermissions(aco: AcoRef): Promise<EffectivePermission[]> {
    if (aco.type === 'FOLDER') {
      const rows = await this.prisma.folderPermission.findMany({
        where: { folderId: aco.id },
        select: { aroType: true, aroId: true, level: true },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((row) => ({
        type: row.aroType,
        id: row.aroId,
        level: row.level as PermissionLevelName,
      }));
    }

    const rows = await this.prisma.resourcePermission.findMany({
      where: { resourceId: aco.id },
      select: { aroType: true, aroId: true, level: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      type: row.aroType,
      id: row.aroId,
      level: row.level as PermissionLevelName,
    }));
  }

  async assertHasOwner(resourceId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const owners = await client.resourcePermission.findMany({
      where: { resourceId, level: 'OWNER' },
      select: { aroType: true, aroId: true },
    });
    if (owners.length === 0) {
      throw new NotFoundException('Resource must have at least one OWNER');
    }
  }

  async assertOwnerRemains(
    resourceId: string,
    removing: { type: 'USER' | 'GROUP'; id: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const owners = await client.resourcePermission.findMany({
      where: { resourceId, level: 'OWNER' },
      select: { aroType: true, aroId: true },
    });
    const keys = owners.map((owner) => `${owner.aroType}:${owner.aroId}`);
    if (!canRemoveOwner(keys, `${removing.type}:${removing.id}`)) {
      throw new ForbiddenException('Resource must keep at least one OWNER');
    }
  }

  async listResourceIdsForAro(
    aroType: 'USER' | 'GROUP',
    aroId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx ?? this.prisma;
    const rows = await client.resourcePermission.findMany({
      where: { aroType, aroId },
      select: { resourceId: true },
    });
    return rows.map((row) => row.resourceId);
  }

  async listFolderIdsForAro(
    aroType: 'USER' | 'GROUP',
    aroId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.folderPermission.findMany({
      where: { aroType, aroId },
      select: { folderId: true },
    });
    return rows.map((row) => row.folderId);
  }
}

export type { PermissionLevel };
