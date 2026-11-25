import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { REQUIRE_PERMISSION_KEY, type RequirePermissionMeta } from '../decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../types';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<RequirePermissionMeta | undefined>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const rawId = request.params[meta.fromParam ?? 'id'];
    const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
    if (!id) {
      throw new NotFoundException(`${meta.aco} not found`);
    }

    await this.permissions.assertCan(user.id, { type: meta.aco, id }, meta.action);
    return true;
  }
}