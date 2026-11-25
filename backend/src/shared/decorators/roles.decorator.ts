import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'securevault:roles';

export function Roles(...roles: Array<'USER' | 'ADMIN'>): MethodDecorator & ClassDecorator {
  return SetMetadata(ROLES_KEY, roles);
}