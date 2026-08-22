import type { RoleKey } from '@fcare/shared-types';

/** Người dùng đã xác thực, gắn vào request bởi JwtStrategy. */
export interface AuthUser {
  id: string;
  staffCode: string;
  fullName: string;
  roles: RoleKey[];
  departmentId: string | null;
  consented: boolean;
  mustChangePassword: boolean;
}

/** Payload của access token. */
export interface AccessTokenPayload {
  sub: string;
  staffCode: string;
  fullName: string;
  roles: RoleKey[];
  departmentId: string | null;
  consented: boolean;
  mustChangePassword: boolean;
}
