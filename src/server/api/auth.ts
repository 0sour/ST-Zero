import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { hashPassword, signToken, toSafeUser, verifyPassword, User } from '../auth/passwords.js';
import { loginLimiter, requireAuth } from '../auth/middleware.js';

export const authRouter = Router();

/** 种 httpOnly 会话 cookie（供 /files 等非 API 资源鉴权） */
function setSessionCookie(res: import('express').Response, token: string) {
  res.cookie('stzero_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
}

/** 登录 */
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const ip = req.ip || 'unknown';
    try {
      await loginLimiter.consume(ip);
    } catch {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as User | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(403).json({ error: 'Incorrect credentials' });
    }
    if (!user.enabled) {
      return res.status(403).json({ error: 'User is disabled' });
    }
    const token = signToken(user);
    setSessionCookie(res, token);
    return res.json({ token, user: toSafeUser(user) });
  } catch (e) {
    console.error('[auth] Login failed:', e);
    return res.sendStatus(500);
  }
});

/** 站点设置（数据库优先，环境变量兜底） */
function siteSetting(key: string): unknown {
  const row = getDb().prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
function allowRegistration(): boolean {
  const v = siteSetting('allowRegistration');
  if (v !== undefined) return v === true || v === 'true' || v === 1;
  return config.allowRegistration;
}
function defaultUserRole(): string {
  const v = siteSetting('defaultUserRole');
  if (v !== undefined) return String(v);
  return config.defaultUserRole;
}

/** 注册（站点设置优先，环境变量兜底） */
authRouter.post('/register', (req, res) => {
  if (!allowRegistration()) {
    return res.status(403).json({ error: 'Registration is disabled' });
  }
  const { username, password, display_name } = req.body as { username?: string; password?: string; display_name?: string };
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Username must be ≥3 chars, password ≥6 chars' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  // 首个用户自动成为 admin（Open WebUI 模式）
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const role = count === 0 ? 'admin' : defaultUserRole();
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, enabled, display_name, created_at, updated_at, ver) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 0)',
  ).run(id, username, hashPassword(password), role, display_name || username, now, now);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as User;
  const token = signToken(user);
  setSessionCookie(res, token);
  return res.status(201).json({ token, user: toSafeUser(user) });
});

/** 站点公开信息（公告等，登录页展示无需鉴权） */
authRouter.get('/site', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM site_settings WHERE key = ?').get('announcement') as { value: string } | undefined;
  let announcement = '';
  if (row) {
    try { announcement = String(JSON.parse(row.value)); } catch { announcement = row.value; }
  }
  return res.json({ announcement });
});

/** 当前用户信息 */
authRouter.get('/me', requireAuth, (req, res) => {
  return res.json({ user: toSafeUser(req.user!) });
});

/** 退出登录（清除会话 cookie） */
authRouter.post('/logout', (_req, res) => {
  res.clearCookie('stzero_token');
  return res.json({ ok: true });
});
