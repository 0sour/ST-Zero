import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { createHeader, parseChatJsonl, serializeChatJsonl, ChatMessage } from '../format/chat.js';

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

/** 群聊列表 */
groupsRouter.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM groups WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  return res.json({ groups: rows });
});

/** 创建群聊 */
groupsRouter.post('/', (req, res) => {
  const { name, member_ids } = req.body as { name?: string; member_ids?: string[] };
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = randomUUID();
  const now = Date.now();
  const members = (member_ids ?? []).filter((m) => m);
  getDb()
    .prepare('INSERT INTO groups (id, user_id, name, member_ids, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)')
    .run(id, req.user!.id, name, JSON.stringify(members), now, now);
  return res.status(201).json({ id });
});

/** 群聊详情 */
groupsRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Group not found' });
  const members = JSON.parse(row.member_ids as string) as string[];
  const chars = members.length
    ? getDb().prepare(`SELECT id, name, avatar_path FROM characters WHERE id IN (${members.map(() => '?').join(',')})`).all(...members)
    : [];
  return res.json({ group: row, members: chars });
});

/** 更新群聊（成员/名称） */
groupsRouter.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Group not found' });
  const { name, member_ids } = req.body as { name?: string; member_ids?: string[] };
  const sets: string[] = [];
  const params: Array<string | number> = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (member_ids !== undefined) { sets.push('member_ids = ?'); params.push(JSON.stringify(member_ids)); }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at = ?');
  params.push(Date.now(), req.params.id);
  getDb().prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return res.json({ ok: true });
});

/** 删除群聊 */
groupsRouter.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Group not found' });
  if (row.chat_id) {
    fs.rmSync(path.join(config.dataDir, `users/${req.user!.id}/chats/${row.chat_id}.jsonl`), { force: true });
  }
  getDb().prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

/** 群聊消息（JSONL 存于 chats 目录，group 前缀） */
groupsRouter.get('/:id/messages', (req, res) => {
  const row = getDb().prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Group not found' });
  const absPath = path.join(config.dataDir, `users/${req.user!.id}/chats/group-${req.params.id}.jsonl`);
  if (!fs.existsSync(absPath)) return res.json({ messages: [] });
  const { messages } = parseChatJsonl(fs.readFileSync(absPath, 'utf-8'));
  return res.json({ messages });
});

/** 群聊发送消息（指定角色回复） */
groupsRouter.post('/:id/messages', (req, res) => {
  const row = getDb().prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Group not found' });
  const { content, character_id } = req.body as { content?: string; character_id?: string };
  if (!content) return res.status(400).json({ error: 'content is required' });
  const absPath = path.join(config.dataDir, `users/${req.user!.id}/chats/group-${req.params.id}.jsonl`);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const { header, messages } = fs.existsSync(absPath)
    ? parseChatJsonl(fs.readFileSync(absPath, 'utf-8'))
    : { header: createHeader(), messages: [] as ChatMessage[] };

  const userMsg: ChatMessage = {
    name: req.user!.display_name || req.user!.username,
    is_user: true,
    send_date: Date.now(),
    mes: content,
    extra: {},
  };
  messages.push(userMsg);

  // 指定角色回复（模拟：直接追加一条角色消息）
  if (character_id) {
    const char = getDb().prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(character_id, req.user!.id) as Record<string, unknown> | undefined;
    if (char) {
      const aiMsg: ChatMessage = {
        name: char.name as string,
        is_user: false,
        send_date: Date.now(),
        mes: '（' + (char.name as string) + ' 加入了对话）',
        extra: { character_id },
      };
      messages.push(aiMsg);
    }
  }
  fs.writeFileSync(absPath, serializeChatJsonl(header, messages));
  getDb().prepare('UPDATE groups SET chat_id = ?, updated_at = ? WHERE id = ?').run(req.params.id, Date.now(), req.params.id);
  return res.json({ ok: true, messages });
});
