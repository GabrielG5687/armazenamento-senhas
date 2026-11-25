import { SetMetadata } from '@nestjs/common';
import type { AcoTypeName, PermissionActionName } from '../types';

export const REQUIRE_PERMISSION_KEY = 'securevault:requirePermission';

export interface RequirePermissionMeta {
  aco: AcoTypeName;
  action: PermissionActionName;
  fromParam?: string;
}

export function RequirePermission(meta: RequirePermissionMeta): MethodDecorator {
  return SetMetadata(REQUIRE_PERMISSION_KEY, meta);
}