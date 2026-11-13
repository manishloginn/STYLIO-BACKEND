import { Role } from '../enums';

export interface AuthUser {
  sub: string;
  role: Role;
  phone: string;
}
