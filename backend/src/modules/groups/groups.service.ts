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
import { CryptographyService } from '../cryptography/cryptography.service';
import { AuditService } from '../audit/audit.service';
import type { CreateGroupDto, UpdateGroupDto } from './dto/groups.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly cryptography: CryptographyService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string) {
    const groups = await this.prisma.group.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { removedAt: null },
          select: { userId: true, role: true },
        },
      },
    });

    return groups.map((group) => {
      const membership = group.members.find((member) => member.userId === userId);
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        memberCount: group.members.length,
        role: membership?.role ?? null,
      };
    });
  }

  async get(userId: string, id: string, requesterRole: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: {
          where: { removedAt: null },
          include: {
            user: { select: { id: true, email: true, status: true } },
          },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const membership = group.members.find((member) => member.userId === userId);
    if (!membership && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('You are not a member of this group');
    }

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      role: membership?.role ?? null,
      members: group.members.map((member) => ({
        userId: member.userId,
        role: member.role,
        addedAt: member.addedAt,
        email: member.user.email,
        status: member.user.status,
      })),
      managers: group.members
        .filter((member) => member.role === 'MANAGER')
        .map((member) => member.userId),
    };
  }

  async create(userId: string, input: CreateGroupDto) {
    const duplicate = await this.prisma.group.findFirst({
      where: { name: input.name, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Group name already in use');
    }

    const group = await this.prisma.group.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        createdById: userId,
        updatedById: userId,
        members: {
          create: {
            userId,
            role: 'MANAGER',
            addedById: userId,
          },
        },
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'group.created',
      targetType: 'GROUP',
      targetId: group.id,
      metadata: { name: group.name },
    });

    return { id: group.id, name: group.name, description: group.description };
  }

  async update(userId: string, id: string, input: UpdateGroupDto) {
    await this.assertManager(userId, id);

    if (input.name) {
      const duplicate = await this.prisma.group.findFirst({
        where: { name: input.name, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Group name already in use');
      }
    }

    const group = await this.prisma.group.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedById: userId,
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'group.updated',
      targetType: 'GROUP',
      targetId: id,
      metadata: { changedFields: Object.keys(input) },
    });

    return { id: group.id, name: group.name, description: group.description };
  }

  async remove(userId: string, id: string) {
    await this.assertManager(userId, id);

    const resources = await this.prisma.resourcePermission.findMany({
      where: { aroType: 'GROUP', aroId: id, level: { in: ['READ', 'UPDATE', 'OWNER'] } },
      select: { resourceId: true },
    });

    await this.prisma.group.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });

    for (const resource of resources) {
      await this.pruneOrphanEnvelopes(resource.resourceId);
    }

    await this.audit.record({
      actorId: userId,
      action: 'group.deleted',
      targetType: 'GROUP',
      targetId: id,
      metadata: { resources: resources.length },
    });
  }

  async addMember(userId: string, groupId: string, targetUserId: string) {
    await this.assertManager(userId, groupId);

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!target) {
      throw new UnprocessableEntityException('Target user is not active');
    }

    const existing = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: targetUserId, removedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this group');
    }

    const resourceIds = await this.getResourceIdsForGroup(groupId);

    if (resourceIds.length === 0) {
      await this.addMemberInternal(userId, groupId, targetUserId);
      await this.audit.record({
        actorId: userId,
        action: 'group.member.added',
        targetType: 'GROUP',
        targetId: groupId,
        metadata: { userId: targetUserId, rekeyRequired: false },
      });
      return { operationId: null, status: 'COMPLETED', resources: [] };
    }

    const key = await this.cryptography.getActiveKey(targetUserId);
    if (!key) {
      throw new UnprocessableEntityException('Target user has no active public key');
    }

    const operation = await this.prisma.sharingOperation.create({
      data: {
        operation: 'GROUP_REKEY',
        actorId: userId,
        groupId,
        status: 'PENDING',
        idempotencyKey: `group-rekey:${groupId}:${targetUserId}:${Date.now()}`,
        payload: { groupId, userId: targetUserId, resourceIds },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true, status: true },
    });

    await this.audit.record({
      actorId: userId,
      action: 'group.member.added',
      targetType: 'GROUP',
      targetId: groupId,
      metadata: { userId: targetUserId, rekeyRequired: true, operationId: operation.id },
    });

    return {
      operationId: operation.id,
      status: operation.status,
      resources: resourceIds,
    };
  }

  async removeMember(userId: string, groupId: string, targetUserId: string) {
    await this.assertManager(userId, groupId);

    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: targetUserId, removedAt: null },
      select: { id: true, role: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === 'MANAGER') {
      const managers = await this.prisma.groupMember.count({
        where: { groupId, role: 'MANAGER', removedAt: null },
      });
      if (managers <= 1) {
        throw new ConflictException('Group must keep at least one MANAGER');
      }
    }

    const resourceIds = await this.getResourceIdsForGroup(groupId);

    await this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { removedAt: new Date() },
    });

    for (const resourceId of resourceIds) {
      await this.pruneOrphanEnvelopes(resourceId, targetUserId);
    }

    await this.audit.record({
      actorId: userId,
      action: 'group.member.removed',
      targetType: 'GROUP',
      targetId: groupId,
      metadata: { userId: targetUserId, resources: resourceIds },
    });
  }

  async promoteManager(userId: string, groupId: string, targetUserId: string) {
    await this.assertManager(userId, groupId);
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: targetUserId, removedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    await this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { role: 'MANAGER' },
    });
    await this.audit.record({
      actorId: userId,
      action: 'group.manager.promoted',
      targetType: 'GROUP',
      targetId: groupId,
      metadata: { userId: targetUserId },
    });
    return { groupId, userId: targetUserId, role: 'MANAGER' };
  }

  async demoteManager(userId: string, groupId: string, targetUserId: string) {
    await this.assertManager(userId, groupId);
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: targetUserId, removedAt: null },
      select: { id: true, role: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.role === 'MANAGER') {
      const managers = await this.prisma.groupMember.count({
        where: { groupId, role: 'MANAGER', removedAt: null },
      });
      if (managers <= 1) {
        throw new ConflictException('Group must keep at least one MANAGER');
      }
    }
    await this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { role: 'MEMBER' },
    });
    await this.audit.record({
      actorId: userId,
      action: 'group.manager.demoted',
      targetType: 'GROUP',
      targetId: groupId,
      metadata: { userId: targetUserId },
    });
    return { groupId, userId: targetUserId, role: 'MEMBER' };
  }

  async groupPermissions(groupId: string) {
    const rows = await this.prisma.resourcePermission.findMany({
      where: { aroType: 'GROUP', aroId: groupId },
      select: { resourceId: true, level: true },
    });
    return rows;
  }

  async isManager(userId: string, groupId: string): Promise<boolean> {
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId, removedAt: null, role: 'MANAGER', group: { deletedAt: null } },
      select: { id: true },
    });
    return membership !== null;
  }

  async assertManager(userId: string, groupId: string): Promise<void> {
    if (!(await this.isManager(userId, groupId))) {
      throw new ForbiddenException('Only group managers can perform this action');
    }
  }

  async listActiveMemberIds(groupId: string): Promise<string[]> {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, removedAt: null, group: { deletedAt: null } },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  async listActiveManagerIds(groupId: string): Promise<string[]> {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, removedAt: null, role: 'MANAGER', group: { deletedAt: null } },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  async getEffectiveGroupIds(userId: string): Promise<string[]> {
    return this.permissions.getActiveGroupIds(userId);
  }

  async addMemberInternal(
    actorId: string,
    groupId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.groupMember.findFirst({
      where: { groupId, userId },
      select: { id: true, removedAt: true },
    });
    if (existing) {
      if (existing.removedAt !== null) {
        await client.groupMember.update({
          where: { id: existing.id },
          data: { removedAt: null, addedById: actorId, addedAt: new Date() },
        });
      }
      return;
    }
    await client.groupMember.create({
      data: { groupId, userId, role: 'MEMBER', addedById: actorId },
    });
  }

  async getResourceIdsForGroup(groupId: string): Promise<string[]> {
    const rows = await this.prisma.resourcePermission.findMany({
      where: { aroType: 'GROUP', aroId: groupId },
      select: { resourceId: true },
    });
    return rows.map((row) => row.resourceId);
  }

  private async pruneOrphanEnvelopes(resourceId: string, onlyUserId?: string) {
    const permissions = await this.prisma.resourcePermission.findMany({
      where: { resourceId },
      select: { aroType: true, aroId: true },
    });
    const groupIds = permissions
      .filter((permission) => permission.aroType === 'GROUP')
      .map((permission) => permission.aroId);

    let memberIds: string[] = [];
    if (groupIds.length > 0) {
      const members = await this.prisma.groupMember.findMany({
        where: { groupId: { in: groupIds }, removedAt: null },
        select: { userId: true },
      });
      memberIds = [...new Set(members.map((member) => member.userId))];
    }

    const directUserIds = permissions
      .filter((permission) => permission.aroType === 'USER')
      .map((permission) => permission.aroId);

    const candidates = onlyUserId ? [onlyUserId] : memberIds;
    for (const userId of candidates) {
      const hasDirect = directUserIds.includes(userId);
      let hasOtherGroup = false;
      if (!hasDirect) {
        const otherGroupIds = groupIds;
        if (otherGroupIds.length > 0) {
          const otherMemberships = await this.prisma.groupMember.count({
            where: {
              userId,
              groupId: { in: otherGroupIds },
              removedAt: null,
              group: { deletedAt: null },
            },
          });
          hasOtherGroup = otherMemberships > 0;
        }
      }
      if (hasDirect || hasOtherGroup) {
        continue;
      }
      await this.deleteCurrentEnvelope(resourceId, userId);
    }
  }

  private async deleteCurrentEnvelope(resourceId: string, userId: string) {
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
}