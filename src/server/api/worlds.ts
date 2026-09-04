import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { parseWorldInfo, serializeWorldInfo, WorldInfoFile } from '../format/world-info.js';

export const worldsRouter = Router();
worldsRouter.use(requireAuth);

function userDir(userId: string): string {
  return path.join(config.dataDir, 'users', userId);
}

/** 世界书列表 */
worldsRouter.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM worlds WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  return res.json({ worlds: rows });
});

/** 世界书详情 */
worldsRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM worlds WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'World info not found' });
  const text = fs.readFileSync(path.join(config.dataDir, row.file_path as string), 'utf-8');
  const wi = parseWorldInfo(JSON.parse(text));
  return res.json({ world: row, data: wi });
});

/** 创建世界书 */
worldsRouter.post('/', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = randomUUID();
  const now = Date.now();
  const relPath = path.join('users', req.user!.id, 'worlds', `${id}.json`);
  const absPath = path.join(config.dataDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const wi: WorldInfoFile = { name, entries: {}, extensions: {} };
  fs.writeFileSync(absPath, serializeWorldInfo(wi));
  getDb().prepare('INSERT INTO worlds (id, user_id, name, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user!.id, name, relPath, now, now);
  return res.status(201).json({ id });
});

/** 更新世界书（整文件替换） */
worldsRouter.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM worlds WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'World info not found' });
  const wi = parseWorldInfo(req.body);
  fs.writeFileSync(path.join(config.dataDir, row.file_path as string), serializeWorldInfo(wi));
  getDb().prepare('UPDATE worlds SET name = ?, updated_at = ? WHERE id = ?').run(wi.name ?? row.name, Date.now(), req.params.id);
  return res.json({ ok: true });
});

/** 删除世界书 */
worldsRouter.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM worlds WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'World info not found' });
  fs.rmSync(path.join(config.dataDir, row.file_path as string), { force: true });
  getDb().prepare('DELETE FROM worlds WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

/** 导入世界书（JSON 文本） */
worldsRouter.post('/import', (req, res) => {
  try {
    // 客户端可传 name（通常来自文件名）；世界书 JSON 内 name 优先
    const body = req.body as Record<string, unknown>;
    const wi = parseWorldInfo(body);
    const name = wi.name || (typeof body.name === 'string' && body.name ? body.name : '导入的世界书');
    const id = randomUUID();
    const now = Date.now();
    const relPath = path.join('users', req.user!.id, 'worlds', `${id}.json`);
    const absPath = path.join(config.dataDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, serializeWorldInfo(wi));
    getDb().prepare('INSERT INTO worlds (id, user_id, name, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user!.id, name, relPath, now, now);
    return res.status(201).json({ id, name });
  } catch (e) {
    return res.status(400).json({ error: 'Import failed: ' + (e as Error).message });
  }
});
