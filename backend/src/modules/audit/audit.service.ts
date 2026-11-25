import { Injectable, Logger } from '@nestjs/common';
import type { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { RequestContextService } from '../../shared/context/request-context.service';

export interface AuditRecordInput {
  actorId?: string | null;
  actorType?: AuditActorType;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const context = this.requestContext.get();
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          actorType: input.actorType ?? (input.actorId ? 'USER' : 'SYSTEM'),
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          metadata: input.metadata ?? {},
          ip: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
          requestId: context?.requestId ?? null,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry ${input.action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}