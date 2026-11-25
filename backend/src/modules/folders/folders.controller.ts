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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FoldersService } from './folders.service';
import {
  CreateFolderDto,
  MoveFolderDto,
  UpdateFolderDto,
} from './dto/folders.dto';
import { SetPermissionsDto } from '../../shared/dto/permission.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/types';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.folders.list(user.id);
  }

  @Post()
  create(@Body() body: CreateFolderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.folders.create(user.id, body);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.folders.get(user.id, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateFolderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.folders.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.folders.remove(user.id, id);
  }

  @Post(':id/move')
  move(
    @Param('id') id: string,
    @Body() body: MoveFolderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.folders.move(user.id, id, body.parentId);
  }

  @Get(':id/permissions')
  permissions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.folders.listPermissions(user.id, id);
  }

  @Put(':id/permissions')
  setPermissions(
    @Param('id') id: string,
    @Body() body: SetPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.folders.setPermissions(user.id, id, body.recipients);
  }
}
