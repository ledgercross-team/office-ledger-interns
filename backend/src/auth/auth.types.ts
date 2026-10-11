import type { Request } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const JWT_ISSUER = 'office-ledger-api';
export const JWT_AUDIENCE = 'office-ledger-web';

export type Role = 'game_master' | 'admin' | 'manager' | 'employee';

export interface JwtPayload {
  sub: string;
  role: Role;
  companyId: string | null;
  tv: number;
}

export interface AuthUser {
  id: string;
  role: Role;
  companyId: string | null;
  fullName: string;
  mustChangePassword: boolean;
}

export interface PublicUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  companyId: string | null;
  mustChangePassword: boolean;
}

export interface LoginUser extends AuthUser {
  email: string;
  tokenVersion: number;
}

export interface CurrentUserState {
  role: Role;
  companyId: string | null;
  fullName: string;
  isActive: boolean;
  companyActive: boolean;
  tokenVersion: number;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: LoginUser;
}
