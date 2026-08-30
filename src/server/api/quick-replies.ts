import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

/**
 * 快捷回复 API（存用户 settings 的 quickReplies 字段）
 */
export const quickRepliesRouter = Router();
quickRepliesRouter.use(requireAuth);

function getSettings(userId: string): Record<string, unknown> {
  const row = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(userId) as { data?: string } | undefined;
  return row?.data ? JSON.parse(row.data) : {};
}

function saveSettings(userId: string, settings: Record<string, unknown>) {
  getDb()
    .prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
    .run(userId, JSON.stringify(settings));
}

/** 快捷回复列表 */
quickRepliesRouter.get('/', (req, res) => {
  const settings = getSettings(req.user!.id);
  return res.json({ quickReplies: (settings.quickReplies as unknown[]) ?? [] });
});

/** 创建快捷回复 */
quickRepliesRouter.post('/', (req, res) => {
  const { label, message } = req.body as { label?: string; message?: string };
  if (!label || !message) return res.status(400).json({ error: 'label and message are required' });
  const settings = getSettings(req.user!.id);
  const qrs = (settings.quickReplies as Array<Record<string, unknown>>) ?? [];
  qrs.push({ id: 'qr-' + Date.now(), label, message });
  settings.quickReplies = qrs;
  saveSettings(req.user!.id, settings);
  return res.status(201).json({ quickReply: qrs[qrs.length - 1] });
});

/** 删除快捷回复 */
quickRepliesRouter.delete('/:id', (req, res) => {
  const settings = getSettings(req.user!.id);
  const qrs = (settings.quickReplies as Array<Record<string, unknown>>) ?? [];
  const filtered = qrs.filter((q) => q.id !== req.params.id);
  if (filtered.length === qrs.length) return res.status(404).json({ error: 'Quick reply not found' });
  settings.quickReplies = filtered;
  saveSettings(req.user!.id, settings);
  return res.json({ ok: true });
});
