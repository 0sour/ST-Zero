import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { initDb, getDb } from './db.js';
import { hashPassword, User } from './auth/passwords.js';
import { authRouter } from './api/auth.js';
import { charactersRouter } from './api/characters.js';
import { chatsRouter } from './api/chats.js';
import { worldsRouter } from './api/worlds.js';
import { settingsRouter } from './api/settings.js';
import { adminRouter } from './api/admin.js';
import { regexRouter } from './api/regex.js';
import { presetsRouter } from './api/presets.js';
import { quickRepliesRouter } from './api/quick-replies.js';
import { groupsRouter } from './api/groups.js';
import { serveUserFile } from './files.js';

/** 种子：单用户模式内置默认管理员；多用户模式首个用户自动 admin */
function seed() {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (count === 0) {
    const now = Date.now();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role, enabled, display_name, created_at, updated_at, ver) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 0)',
    ).run(
      randomUUID(),
      config.defaultUserHandle,
      hashPassword('admin'),
      'admin',
      '默认管理员',
      now,
      now,
    );
    console.log('[seed] Created default admin user (username: default-user, password: admin)');
  }
}

export function createApp() {
  initDb();
  seed();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // 健康检查
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // 静态文件服务（前端）
  app.use(express.static(path.join(process.cwd(), 'public-new')));

  // 用户文件服务（JWT 鉴权 + 用户目录隔离）
  app.use('/files', serveUserFile);

  // API 路由
  app.use('/api/auth', authRouter);
  app.use('/api/characters', charactersRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api/worlds', worldsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/regex', regexRouter);
  app.use('/api/presets', presetsRouter);
  app.use('/api/quick-replies', quickRepliesRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/admin', adminRouter);

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // 错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
