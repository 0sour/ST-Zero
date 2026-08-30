import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { hashPassword, signToken, toSafeUser, verifyPassword, User } from '../auth/passwords.js';
import { loginLimiter, requireAuth } from '../auth/middleware.js';

export const authRouter = Router();

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
    return res.json({ token, user: toSafeUser(user) });
  } catch (e) {
    console.error('[auth] Login failed:', e);
    return res.sendStatus(500);
  }
});

/** 注册（仅开放注册时） */
authRouter.post('/register', (req, res) => {
  if (!config.allowRegistration) {
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
  const role = count === 0 ? 'admin' : config.defaultUserRole;
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, enabled, display_name, created_at, updated_at, ver) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 0)',
  ).run(id, username, hashPassword(password), role, display_name || username, now, now);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as User;
  return res.status(201).json({ token: signToken(user), user: toSafeUser(user) });
});

/** 当前用户信息 */
authRouter.get('/me', requireAuth, (req, res) => {
  return res.json({ user: toSafeUser(req.user!) });
});
