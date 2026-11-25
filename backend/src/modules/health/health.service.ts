import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live() {
    return { status: 'ok' };
  }

  async ready() {
    try {
      await this.prisma.user.count();
      return { status: 'ok' };
    } catch {
      return { status: 'error' };
    }
  }
}