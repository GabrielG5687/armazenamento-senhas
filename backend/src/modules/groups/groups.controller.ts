import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import {
  AddGroupMemberDto,
  CreateGroupDto,
  UpdateGroupDto,
} from './dto/groups.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/types';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.groups.list(user.id);
  }

  @Post()
  create(@Body() body: CreateGroupDto, @CurrentUser() user: AuthenticatedUser) {
    return this.groups.create(user.id, body);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.get(user.id, id, user.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.groups.remove(user.id, id);
  }

  @Post(':id/members')
  @HttpCode(202)
  addMember(
    @Param('id') id: string,
    @Body() body: AddGroupMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.addMember(user.id, id, body.userId);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.groups.removeMember(user.id, id, userId);
  }

  @Get(':id/permissions')
  permissions(@Param('id') id: string) {
    return this.groups.groupPermissions(id);
  }

  @Post(':id/managers/:userId')
  promote(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.promoteManager(user.id, id, userId);
  }

  @Delete(':id/managers/:userId')
  demote(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.demoteManager(user.id, id, userId);
  }
}