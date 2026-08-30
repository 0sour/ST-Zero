import type { NextFunction, Request, Response } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { TokenPayload, User, verifyToken } from './passwords.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      token?: TokenPayload;
    }
  }
}

/** 登录限流：5 次/分钟/IP */
export const loginLimiter = new RateLimiterMemory({
  points: config.loginRateLimit,
  duration: 60,
});

/** 认证中间件：校验 Bearer token，加载用户 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const user = getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(payload.sub) as unknown as User | undefined;
  if (!user || !user.enabled) {
    return res.status(401).json({ error: 'User not found or disabled' });
  }
  // 密码/角色变更后 ver 递增，旧 token 失效
  if (user.ver !== payload.ver) {
    return res.status(401).json({ error: 'Token revoked' });
  }
  req.user = user;
  req.token = payload;
  next();
}

/** 管理员中间件：admin 是 user 的超集 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
