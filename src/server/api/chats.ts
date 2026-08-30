import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { createHeader, parseChatJsonl, serializeChatJsonl, ChatMessage } from '../format/chat.js';
import { readCharacterCardJson } from '../format/png.js';
import { normalizeToV2, CharacterCardV2 } from '../format/character-card.js';
import { scanWorldInfo, DEFAULT_WI_SETTINGS } from '../engine/lorebook.js';
import { buildPrompt, CharacterPromptData } from '../engine/prompt.js';
import { generateChatCompletion, generateTextCompletion, BackendConfig } from '../backends/index.js';

export const chatsRouter = Router();
chatsRouter.use(requireAuth);

function userDir(userId: string): string {
  return path.join(config.dataDir, 'users', userId);
}

/** 聊天列表 */
chatsRouter.get('/', (req, res) => {
  const characterId = req.query.characterId as string | undefined;
  const rows = characterId
    ? getDb().prepare('SELECT * FROM chats WHERE user_id = ? AND character_id = ? ORDER BY updated_at DESC').all(req.user!.id, characterId)
    : getDb().prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  return res.json({ chats: rows });
});

/** 创建聊天 */
chatsRouter.post('/', (req, res) => {
  const { character_id, title } = req.body as { character_id?: string; title?: string };
  if (!character_id) return res.status(400).json({ error: 'character_id is required' });
  const char = getDb().prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(character_id, req.user!.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });

  const id = randomUUID();
  const now = Date.now();
  const fileName = `${id}.jsonl`;
  const relPath = path.join('users', req.user!.id, 'chats', fileName);
  const absPath = path.join(config.dataDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, serializeChatJsonl(createHeader(), []));

  getDb()
    .prepare('INSERT INTO chats (id, user_id, character_id, title, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user!.id, character_id, title || '新聊天', relPath, now, now);
  return res.status(201).json({ id });
});

/** 聊天消息 */
chatsRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const absPath = path.join(config.dataDir, row.file_path as string);
  const text = fs.readFileSync(absPath, 'utf-8');
  const { header, messages } = parseChatJsonl(text);
  return res.json({ chat: row, header, messages });
});

/** 发送消息 + 生成回复（SSE 流式） */
chatsRouter.post('/:id/messages', async (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const { content } = req.body as { content?: string };
  if (!content) return res.status(400).json({ error: 'content is required' });

  const absPath = path.join(config.dataDir, row.file_path as string);
  const { header, messages } = parseChatJsonl(fs.readFileSync(absPath, 'utf-8'));

  // 用户消息
  const userMsg: ChatMessage = {
    name: req.user!.display_name || req.user!.username,
    is_user: true,
    send_date: Date.now(),
    mes: content,
    extra: {},
  };
  messages.push(userMsg);

  // 加载角色卡
  const char = getDb().prepare('SELECT * FROM characters WHERE id = ?').get(row.character_id as string) as Record<string, unknown>;
  const png = fs.readFileSync(path.join(config.dataDir, char.avatar_path as string));
  const parsed = readCharacterCardJson(png);
  const card = normalizeToV2(parsed?.json ?? { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Unknown' } });
  const data = card.data;

  // 世界书扫描（简化：无世界书时跳过）
  const worldInfo = scanWorldInfo({
    entries: [],
    chatMessages: messages,
    settings: DEFAULT_WI_SETTINGS,
    maxContext: 4096,
  });

  const promptData: CharacterPromptData = {
    name: data.name,
    description: data.description ?? '',
    personality: data.personality ?? '',
    scenario: data.scenario ?? '',
    first_mes: data.first_mes ?? '',
    mes_example: data.mes_example ?? '',
    system_prompt: data.system_prompt,
    post_history_instructions: data.post_history_instructions,
    alternate_greetings: data.alternate_greetings,
  };

  // 后端配置（从用户设置读取，简化版）
  const settings = JSON.parse(
    (getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(req.user!.id) as { data?: string } | undefined)?.data ?? '{}',
  ) as { backend?: BackendConfig };
  const backend = settings.backend ?? { type: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: '' };

  // 构建 prompt
  const promptResult = buildPrompt({
    character: promptData,
    chat: messages,
    worldInfo,
    persona: '',
    userName: req.user!.display_name || req.user!.username,
    instruct: {
      input_sequence: '<|im_start|>user',
      output_sequence: '<|im_start|>assistant',
      system_sequence: '<|im_start|>system',
      stop_sequence: '<|im_end|>',
      wrap: true,
      macro: true,
      names_behavior: 'force',
    },
    context: { story_string: '{{system}}\n{{description}}\n{{chatHistory}}', example_separator: '***', chat_start: '***' },
    maxContext: 4096,
    maxTokens: 300,
    regexScripts: [],
    mode: 'chat',
  });

  // SSE 流式
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullReply = '';
  try {
    const stream = backend.type === 'text'
      ? generateTextCompletion(backend, promptResult.prompt, { maxTokens: 300 })
      : generateChatCompletion(backend, promptResult.messages, { maxTokens: 300 });
    for await (const chunk of stream) {
      fullReply += chunk;
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
    }
    // AI 消息
    const aiMsg: ChatMessage = {
      name: data.name,
      is_user: false,
      send_date: Date.now(),
      mes: fullReply,
      swipes: [fullReply],
      swipe_id: 0,
      extra: { api: backend.type, model: backend.model },
    };
    messages.push(aiMsg);
    fs.writeFileSync(absPath, serializeChatJsonl(header, messages));
    getDb().prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), row.id);
    res.write(`data: ${JSON.stringify({ done: true, message: aiMsg })}\n\n`);
    res.end();
  } catch (e) {
    console.error('[chats] Generation failed:', e);
    res.write(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
    res.end();
  }
});

/** 删除聊天 */
chatsRouter.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  fs.rmSync(path.join(config.dataDir, row.file_path as string), { force: true });
  getDb().prepare('DELETE FROM chats WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

/** 导出聊天记录（JSONL） */
chatsRouter.get('/:id/export', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const absPath = path.join(config.dataDir, row.file_path as string);
  const text = fs.readFileSync(absPath, 'utf-8');
  res.setHeader('Content-Type', 'application/jsonl');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent((row.title as string) || 'chat')}.jsonl"`);
  return res.send(text);
});

/** 导入聊天记录（JSONL 文本） */
chatsRouter.post('/import', (req, res) => {
  const { character_id, content } = req.body as { character_id?: string; content?: string };
  if (!character_id || !content) return res.status(400).json({ error: 'character_id and content are required' });
  const char = getDb().prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(character_id, req.user!.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });
  try {
    const { header, messages } = parseChatJsonl(content);
    const id = randomUUID();
    const now = Date.now();
    const fileName = `${id}.jsonl`;
    const relPath = path.join('users', req.user!.id, 'chats', fileName);
    const absPath = path.join(config.dataDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, serializeChatJsonl(header, messages));
    getDb()
      .prepare('INSERT INTO chats (id, user_id, character_id, title, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user!.id, character_id, '导入的聊天', relPath, now, now);
    return res.status(201).json({ id, message_count: messages.length });
  } catch (e) {
    return res.status(400).json({ error: 'Import failed: ' + (e as Error).message });
  }
});
