import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ResourcesService } from './resources.service';
import {
  CreateResourceDto,
  ListResourcesQueryDto,
  MoveResourceDto,
  UpdateResourceDto,
} from './dto/resources.dto';
import { SetPermissionsDto } from '../../shared/dto/permission.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../shared/guards/permission.guard';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/types';

@ApiTags('resources')
@ApiBearerAuth()
@Controller('resources')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  list(@Query() query: ListResourcesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.resources.list(user.id, query);
  }

  @Post()
  create(@Body() body: CreateResourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.resources.create(user.id, body);
  }

  @Get(':id')
  @RequirePermission({ aco: 'RESOURCE', action: 'READ' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.resources.get(user.id, id);
  }

  @Patch(':id')
  @RequirePermission({ aco: 'RESOURCE', action: 'UPDATE' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resources.update(user.id, id, body);
  }

  @Delete(':id')
  @RequirePermission({ aco: 'RESOURCE', action: 'UPDATE' })
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.resources.remove(user.id, id);
  }

  @Get(':id/permissions')
  @RequirePermission({ aco: 'RESOURCE', action: 'READ' })
  permissions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.resources.listPermissions(user.id, id);
  }

  @Put(':id/permissions')
  @RequirePermission({ aco: 'RESOURCE', action: 'SHARE' })
  setPermissions(
    @Param('id') id: string,
    @Body() body: SetPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resources.setPermissions(user.id, id, body.recipients);
  }

  @Post(':id/move')
  @RequirePermission({ aco: 'RESOURCE', action: 'UPDATE' })
  move(
    @Param('id') id: string,
    @Body() body: MoveResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resources.move(user.id, id, body.folderId);
  }
}
