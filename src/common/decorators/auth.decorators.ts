import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../enums';
import { AuthUser } from '../interfaces/auth-user';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
