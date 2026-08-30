import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/** 获取用户设置 */
settingsRouter.get('/', (req, res) => {
  const row = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(req.user!.id) as { data?: string } | undefined;
  return res.json({ settings: row?.data ? JSON.parse(row.data) : {} });
});

/** 更新用户设置（字段级合并） */
settingsRouter.put('/', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT data FROM settings WHERE user_id = ?').get(req.user!.id) as { data?: string } | undefined;
  const merged = { ...(existing?.data ? JSON.parse(existing.data) : {}), ...(req.body as Record<string, unknown>) };
  db.prepare(
    'INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data',
  ).run(req.user!.id, JSON.stringify(merged));
  return res.json({ ok: true, settings: merged });
});
