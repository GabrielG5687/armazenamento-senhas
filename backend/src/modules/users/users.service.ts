import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptographyService } from '../cryptography/cryptography.service';
import type {
  AddPublicKeyDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto/users.dto';

export interface UserView {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: string;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptography: CryptographyService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { profile: { displayName: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.present(row)),
      page,
      pageSize,
      total,
    };
  }

  async create(input: CreateUserDto): Promise<UserView> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('E-mail already registered');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        status: 'ACTIVE',
        role: input.role ?? 'USER',
        profile: {
          create: {
            displayName: input.displayName,
          },
        },
      },
      include: { profile: true },
    });

    return this.present(user);
  }

  async getById(id: string, requesterId: string, requesterRole: string): Promise<UserView> {
    if (id !== requesterId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Cannot read another user');
    }
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.present(user);
  }

  async update(
    id: string,
    input: UpdateUserDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<UserView> {
    if (id !== requesterId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Cannot update another user');
    }
    const data: Prisma.UserUpdateInput = {};
    if (input.role && requesterRole === 'ADMIN') {
      data.role = input.role;
    }
    if (input.status && requesterRole === 'ADMIN') {
      data.status = input.status;
    }
    if (input.displayName) {
      data.profile = {
        upsert: {
          create: { displayName: input.displayName },
          update: { displayName: input.displayName },
        },
      };
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { profile: true },
    });
    return this.present(user);
  }

  async updateProfile(
    id: string,
    input: UpdateProfileDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<UserView> {
    if (id !== requesterId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Cannot update another user');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        profile: {
          upsert: {
            create: {
              displayName: input.displayName ?? 'User',
              locale: input.locale,
              timezone: input.timezone,
              avatarUrl: input.avatarUrl,
            },
            update: {
              ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
              ...(input.locale !== undefined ? { locale: input.locale } : {}),
              ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
              ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
            },
          },
        },
      },
      include: { profile: true },
    });
    return this.present(user);
  }

  async addPublicKey(userId: string, input: AddPublicKeyDto) {
    const validated = await this.cryptography.validatePublicKey(input.armoredPublicKey);

    const duplicate = await this.prisma.userPublicKey.findUnique({
      where: { fingerprint: validated.fingerprint },
      select: { userId: true },
    });
    if (duplicate && duplicate.userId !== userId) {
      throw new ConflictException('Key already registered to another user');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPublicKey.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.userPublicKey.upsert({
        where: {
          userId_fingerprint: {
            userId,
            fingerprint: validated.fingerprint,
          },
        },
        update: {
          keyId: validated.keyId,
          armoredPublicKey: input.armoredPublicKey,
          algorithm: validated.algorithm,
          bits: validated.bits,
          keyType: validated.keyType,
          uid: validated.uid,
          expiresAt: validated.expiresAt,
          revokedAt: null,
          isPrimary: true,
        },
        create: {
          userId,
          fingerprint: validated.fingerprint,
          keyId: validated.keyId,
          armoredPublicKey: input.armoredPublicKey,
          algorithm: validated.algorithm,
          bits: validated.bits,
          keyType: validated.keyType,
          uid: validated.uid,
          expiresAt: validated.expiresAt,
          isPrimary: true,
        },
      });
    });

    return { fingerprint: validated.fingerprint, keyId: validated.keyId };
  }

  async listKeys(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const keys = await this.prisma.userPublicKey.findMany({
      where: {
        userId: { in: unique },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    const seen = new Set<string>();
    return keys
      .filter((key) => {
        if (seen.has(key.userId)) {
          return false;
        }
        seen.add(key.userId);
        return true;
      })
      .map((key) => ({
        userId: key.userId,
        fingerprint: key.fingerprint,
        armoredPublicKey: key.armoredPublicKey,
      }));
  }

  private present(user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    profile?: {
      displayName: string;
      avatarUrl: string | null;
      locale: string;
      timezone: string;
    } | null;
  }): UserView {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      displayName: user.profile?.displayName ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      locale: user.profile?.locale ?? 'pt-BR',
      timezone: user.profile?.timezone ?? 'UTC',
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}