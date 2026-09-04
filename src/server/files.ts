import path from 'node:path';
import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { verifyToken } from './auth/passwords.js';

/**
 * 用户文件服务（替代裸 express.static）
 * 鉴权：Bearer token 或 httpOnly cookie（stzero_token）
 * 隔离：只允许访问 users/{自己的 userId}/ 下的文件
 */
export function serveUserFile(req: Request, res: Response, next: NextFunction) {
  // 1. token
  const header = req.headers.authorization;
  const cookie = (req.cookies as Record<string, string> | undefined)?.['stzero_token'];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookie;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  // 2. 路径隔离：仅允许 users/{token.sub}/ 前缀
  // 注意 req.path 以 / 开头，path.resolve 会把它当绝对路径，必须用 path.join 先拼接
  const absPath = path.resolve(path.join(config.dataDir, req.path));
  const root = path.resolve(config.dataDir, 'users', payload.sub);
  if (absPath !== root && !absPath.startsWith(root + path.sep)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 3. 文件存在性（不存在返回 404，而非 500）
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!stat.isFile()) return res.status(404).json({ error: 'Not found' });

  res.sendFile(absPath, (err) => {
    if (err && !res.headersSent) next(err);
  });
}
