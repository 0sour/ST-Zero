import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { readCharacterCardJson, writeCharacterCardJson } from '../format/png.js';
import { detectSpec, normalizeToV2, toExportV2, getCharacterName, CharacterCardV2 } from '../format/character-card.js';

export const charactersRouter = Router();
charactersRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function userDir(userId: string): string {
  return path.join(config.dataDir, 'users', userId);
}

function ensureUserDir(userId: string) {
  fs.mkdirSync(path.join(userDir(userId), 'characters'), { recursive: true });
}

/** 角色卡列表 */
charactersRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user!.id) as Array<Record<string, unknown>>;
  return res.json({ characters: rows });
});

/** 角色卡详情（含完整 data） */
charactersRouter.get('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  const png = fs.readFileSync(path.join(config.dataDir, row.avatar_path as string));
  const card = readCharacterCardJson(png);
  return res.json({ character: row, card: card?.json ?? null });
});

/** 创建角色卡（multipart：avatar 图片 + 字段） */
charactersRouter.post('/', upload.single('avatar'), (req, res) => {
  const { name, description, personality, scenario, first_mes, mes_example } = req.body as Record<string, string>;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  ensureUserDir(req.user!.id);

  const card: CharacterCardV2 = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name,
      description: description ?? '',
      personality: personality ?? '',
      scenario: scenario ?? '',
      first_mes: first_mes ?? '',
      mes_example: mes_example ?? '',
      extensions: {},
    },
  };

  // 有头像则写入 PNG tEXt chunk，否则生成纯 JSON 卡（用占位 PNG）
  let avatarPath: string;
  const fileName = `${sanitize(name)}-${Date.now()}.png`;
  const relPath = path.join('users', req.user!.id, 'characters', fileName);
  const absPath = path.join(config.dataDir, relPath);
  if (req.file) {
    const png = writeCharacterCardJson(req.file.buffer, card);
    fs.writeFileSync(absPath, png);
  } else {
    // 生成最小合法 PNG（1x1 透明）并写入卡片
    const png = createPlaceholderPng(card);
    fs.writeFileSync(absPath, png);
  }
  avatarPath = relPath;

  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      'INSERT INTO characters (id, user_id, name, avatar_path, spec, tags, fav, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
    )
    .run(id, req.user!.id, name, avatarPath, 'chara_card_v2', '[]', now, now);
  return res.status(201).json({ id, avatar_path: avatarPath });
});

/** 更新角色卡（字段级 PATCH） */
charactersRouter.patch('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });

  const absPath = path.join(config.dataDir, row.avatar_path as string);
  const png = fs.readFileSync(absPath);
  const existing = readCharacterCardJson(png);
  const card = (existing?.json ?? { spec: 'chara_card_v2', spec_version: '2.0', data: {} }) as CharacterCardV2;
  const data = card.data ?? (card as unknown as Record<string, unknown>);

  const allowed = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'tags', 'creator', 'character_version', 'alternate_greetings'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      (data as Record<string, unknown>)[key] = req.body[key];
    }
  }
  if (req.body.extensions && typeof req.body.extensions === 'object') {
    data.extensions = { ...(data.extensions ?? {}), ...req.body.extensions };
  }

  fs.writeFileSync(absPath, writeCharacterCardJson(png, card));
  const name = getCharacterName(card);
  getDb()
    .prepare('UPDATE characters SET name = ?, updated_at = ? WHERE id = ?')
    .run(name, Date.now(), req.params.id);
  return res.json({ ok: true, name });
});

/** 删除角色卡（可选删除聊天） */
charactersRouter.delete('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  fs.rmSync(path.join(config.dataDir, row.avatar_path as string), { force: true });
  if (req.query.delete_chats === 'true') {
    const chats = getDb().prepare('SELECT file_path FROM chats WHERE character_id = ?').all(req.params.id) as Array<{ file_path: string }>;
    for (const c of chats) fs.rmSync(path.join(config.dataDir, c.file_path), { force: true });
  }
  getDb().prepare('DELETE FROM chats WHERE character_id = ?').run(req.params.id);
  getDb().prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

/** 导出角色卡（PNG 或 JSON） */
charactersRouter.get('/:id/export', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  const absPath = path.join(config.dataDir, row.avatar_path as string);
  const png = fs.readFileSync(absPath);
  const format = req.query.format === 'json' ? 'json' : 'png';
  if (format === 'json') {
    const card = readCharacterCardJson(png);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name as string)}.json"`);
    return res.send(JSON.stringify(card?.json ?? {}, null, 2));
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name as string)}.png"`);
  return res.send(png);
});

/** 导入角色卡（multipart：文件 + file_type） */
charactersRouter.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileType = (req.body.file_type as string) || 'png';
  ensureUserDir(req.user!.id);
  try {
    let card: CharacterCardV2;
    if (fileType === 'json' || fileType === 'yaml' || fileType === 'yml') {
      const json = JSON.parse(req.file.buffer.toString('utf-8'));
      card = normalizeToV2(json);
    } else {
      const parsed = readCharacterCardJson(req.file.buffer);
      if (!parsed) return res.status(400).json({ error: 'No character card found in file' });
      card = normalizeToV2(parsed.json);
    }
    const name = getCharacterName(card);
    const fileName = `${sanitize(name)}-${Date.now()}.png`;
    const relPath = path.join('users', req.user!.id, 'characters', fileName);
    const absPath = path.join(config.dataDir, relPath);
    const png = writeCharacterCardJson(req.file.buffer, card);
    fs.writeFileSync(absPath, png);
    const id = randomUUID();
    const now = Date.now();
    getDb()
      .prepare('INSERT INTO characters (id, user_id, name, avatar_path, spec, tags, fav, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .run(id, req.user!.id, name, relPath, 'chara_card_v2', JSON.stringify(card.data.tags ?? []), now, now);
    return res.status(201).json({ id, name, avatar_path: relPath });
  } catch (e) {
    console.error('[characters] Import failed:', e);
    return res.status(400).json({ error: 'Import failed: ' + (e as Error).message });
  }
});

function sanitize(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 64) || 'character';
}

/** 生成最小合法 PNG（1x1 透明）并写入卡片 */
function createPlaceholderPng(card: CharacterCardV2): Buffer {
  // 1x1 透明 PNG
  const base = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
    'hex',
  );
  return writeCharacterCardJson(base, card);
}

/** 切换收藏 */
charactersRouter.post('/:id/fav', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  const fav = req.body.fav === undefined ? !row.fav : !!req.body.fav;
  getDb().prepare('UPDATE characters SET fav = ?, updated_at = ? WHERE id = ?').run(fav ? 1 : 0, Date.now(), req.params.id);
  return res.json({ ok: true, fav });
});
