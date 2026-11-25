import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class ResourceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const types = await this.prisma.resourceType.findMany({
      where: { isActive: true },
      orderBy: { slug: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        currentVersion: true,
      },
    });
    return types;
  }
}