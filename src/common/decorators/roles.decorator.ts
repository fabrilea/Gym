import { SetMetadata } from '@nestjs/common';

export enum Role {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

export const ROLES_KEY = 'roles';

/** Decorator: attach required roles to a route or controller */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
