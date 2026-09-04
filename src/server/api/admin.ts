import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db.js';
import { config } from '../config.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { hashPassword, toSafeUser, User } from '../auth/passwords.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

/** 用户列表 */
adminRouter.get('/users', (_req, res) => {
  const users = getDb().prepare('SELECT * FROM users ORDER BY created_at').all() as unknown as User[];
  return res.json({ users: users.map(toSafeUser) });
});

/** 创建用户 */
adminRouter.post('/users', (req, res) => {
  const { username, password, role, display_name } = req.body as {
    username?: string;
    password?: string;
    role?: 'user' | 'admin';
    display_name?: string;
  };
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, enabled, display_name, created_at, updated_at, ver) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 0)',
  ).run(id, username, hashPassword(password), role ?? 'user', display_name ?? username, now, now);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as User;
  return res.status(201).json({ user: toSafeUser(user) });
});

/** 更新用户（角色/启用禁用） */
adminRouter.patch('/users/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as User | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user!.id && (req.body.role !== undefined || req.body.enabled === false)) {
    return res.status(400).json({ error: 'Cannot change your own role or disable yourself' });
  }
  const { role, enabled, display_name, password } = req.body as {
    role?: 'user' | 'admin';
    enabled?: boolean;
    display_name?: string;
    password?: string;
  };
  const sets: string[] = [];
  const params: Array<string | number> = [];
  if (role !== undefined) { sets.push('role = ?'); params.push(role); sets.push('ver = ver + 1'); }
  if (enabled !== undefined) { sets.push('enabled = ?'); params.push(enabled ? 1 : 0); }
  if (display_name !== undefined) { sets.push('display_name = ?'); params.push(display_name); }
  if (password !== undefined) { sets.push('password_hash = ?'); params.push(hashPassword(password)); sets.push('ver = ver + 1'); }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at = ?');
  params.push(Date.now(), req.params.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as User;
  return res.json({ user: toSafeUser(updated) });
});

/** 删除用户（清除关联数据 + 文件目录，避免外键约束失败） */
adminRouter.delete('/users/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as User | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const uid = req.params.id;
  // 关联数据（chats 先于 characters，groups 引用 characters）
  const chats = db.prepare('SELECT file_path FROM chats WHERE user_id = ?').all(uid) as Array<{ file_path: string }>;
  for (const c of chats) fs.rmSync(path.join(config.dataDir, c.file_path), { force: true });
  const characters = db.prepare('SELECT avatar_path FROM characters WHERE user_id = ?').all(uid) as Array<{ avatar_path: string }>;
  for (const c of characters) fs.rmSync(path.join(config.dataDir, c.avatar_path), { force: true });
  const worlds = db.prepare('SELECT file_path FROM worlds WHERE user_id = ?').all(uid) as Array<{ file_path: string }>;
  for (const w of worlds) fs.rmSync(path.join(config.dataDir, w.file_path), { force: true });
  // 群聊：从成员的 member_ids 中移除该用户
  const groups = db.prepare('SELECT id, member_ids FROM groups').all() as Array<{ id: string; member_ids: string }>;
  const updateGroup = db.prepare('UPDATE groups SET member_ids = ? WHERE id = ?');
  for (const g of groups) {
    const members = (JSON.parse(g.member_ids) as string[]).filter((m) => m !== uid);
    if (members.length !== JSON.parse(g.member_ids).length) updateGroup.run(JSON.stringify(members), g.id);
  }
  // 若该用户还出现在他人群聊成员中（跨用户），一并移除（上面的循环已覆盖全部群）
  db.prepare('DELETE FROM groups WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM chats WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM characters WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM worlds WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM settings WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  // 文件目录
  fs.rmSync(path.join(config.dataDir, 'users', uid), { recursive: true, force: true });
  return res.json({ ok: true });
});

/** 站点设置 */
adminRouter.get('/settings', (_req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM site_settings').all() as Array<{ key: string; value: string }>;
  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
  }
  return res.json({ settings });
});

adminRouter.put('/settings', (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
    upsert.run(k, JSON.stringify(v));
  }
  return res.json({ ok: true });
});
