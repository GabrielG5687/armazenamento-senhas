import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SecretsService } from './secrets.service';
import { CreateSecretVersionDto } from './dto/secrets.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../shared/guards/permission.guard';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/types';

@ApiTags('secrets')
@ApiBearerAuth()
@Controller('resources/:resourceId/secret')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  @RequirePermission({ aco: 'RESOURCE', action: 'READ', fromParam: 'resourceId' })
  getCurrent(
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.secrets.getCurrent(user.id, resourceId);
  }

  @Put()
  @RequirePermission({ aco: 'RESOURCE', action: 'UPDATE', fromParam: 'resourceId' })
  createVersion(
    @Param('resourceId') resourceId: string,
    @Body() body: CreateSecretVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.secrets.createVersion(user.id, resourceId, body);
  }

  @Get('versions')
  @RequirePermission({ aco: 'RESOURCE', action: 'READ', fromParam: 'resourceId' })
  listVersions(
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.secrets.listVersions(user.id, resourceId);
  }

  @Get('versions/:version')
  @RequirePermission({ aco: 'RESOURCE', action: 'READ', fromParam: 'resourceId' })
  getVersion(
    @Param('resourceId') resourceId: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.secrets.getVersion(user.id, resourceId, version);
  }
}