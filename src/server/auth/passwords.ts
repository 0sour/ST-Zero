import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type UserRole = 'user' | 'admin' | 'pending';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  enabled: number;
  display_name: string | null;
  created_at: number;
  updated_at: number;
  ver: number;
}

export interface SafeUser {
  id: string;
  username: string;
  role: UserRole;
  enabled: boolean;
  display_name: string | null;
  created_at: number;
}

/** 密码哈希（bcrypt，cost 12） */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/** 生成 JWT（payload 携带 role 与 ver，密码/角色变更后旧 token 失效） */
export function signToken(user: Pick<User, 'id' | 'username' | 'role' | 'ver'>): string {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, ver: user.ver },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry as jwt.SignOptions['expiresIn'] },
  );
}

export interface TokenPayload {
  sub: string;
  username: string;
  role: UserRole;
  ver: number;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

export function toSafeUser(u: User): SafeUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    enabled: !!u.enabled,
    display_name: u.display_name,
    created_at: u.created_at,
  };
}
