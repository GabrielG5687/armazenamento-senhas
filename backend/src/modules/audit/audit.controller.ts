import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PrismaService } from '../../shared/database/prisma.service';
import { normalizePagination } from '../../shared/utils/pagination';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: AuditQueryDto) {
    const pagination = normalizePagination(query);
    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take + 1,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const hasMore = items.length > pagination.take;
    return {
      items: items.slice(0, pagination.take),
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      hasMore,
    };
  }

  @Get('integrity')
  async integrity() {
    // Hash chain is a documented stub (Fase 5): the schema already has
    // prev_hash/entry_hash, but no writer/verifier exists in this skeleton.
    return { status: 'NOT_IMPLEMENTED', message: 'Audit hash chain is not enabled yet' };
  }

  @Get('export')
  async export() {
    return { status: 'NOT_IMPLEMENTED', message: 'Audit export is not enabled yet' };
  }
}