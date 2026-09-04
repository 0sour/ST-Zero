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
import { WorldInfoEntry } from '../format/world-info.js';
import { parseWorldInfo, extractCharacterBook } from '../format/world-info.js';
import { RegexScript } from '../engine/regex.js';
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
  const { character_id, title, greeting_index } = req.body as { character_id?: string; title?: string; greeting_index?: number };
  if (!character_id) return res.status(400).json({ error: 'character_id is required' });
  const char = getDb().prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(character_id, req.user!.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });

  // 读取角色卡，取首条消息（指定序号或随机备选问候语 → 首条）
  const png = fs.readFileSync(path.join(config.dataDir, char.avatar_path as string));
  const parsed = readCharacterCardJson(png);
  const card = normalizeToV2(parsed?.json ?? { spec: 'chara_card_v2', spec_version: '2.0', data: { name: char.name } });
  const data = card.data;
  let greeting = (data.first_mes ?? '').trim();
  const alternates = Array.isArray(data.alternate_greetings) ? data.alternate_greetings.filter((g) => typeof g === 'string' && g.trim()) : [];
  if (alternates.length) {
    const idx = typeof greeting_index === 'number' && greeting_index >= 0 && greeting_index < alternates.length
      ? greeting_index
      : Math.floor(Math.random() * alternates.length);
    greeting = alternates[idx].trim();
  }
  // 宏替换（{{user}} → 用户显示名）
  const userName = req.user!.display_name || req.user!.username;
  if (greeting) {
    greeting = greeting.replaceAll('{{user}}', userName).replaceAll('{{User}}', userName).replaceAll('{{USER}}', userName);
  }

  const id = randomUUID();
  const now = Date.now();
  const fileName = `${id}.jsonl`;
  const relPath = path.join('users', req.user!.id, 'chats', fileName);
  const absPath = path.join(config.dataDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const messages: ChatMessage[] = greeting
    ? [{ name: data.name, is_user: false, send_date: now, mes: greeting, extra: {} }]
    : [];
  fs.writeFileSync(absPath, serializeChatJsonl(createHeader(), messages));

  getDb()
    .prepare('INSERT INTO chats (id, user_id, character_id, title, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user!.id, character_id, title || '新聊天', relPath, now, now);
  return res.status(201).json({ id, greeting });
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

  // 加载用户设置（世界书/正则/预设/后端/persona）
  const settings = JSON.parse(
    (getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(req.user!.id) as { data?: string } | undefined)?.data ?? '{}',
  ) as {
    backend?: BackendConfig;
    regex?: RegexScript[];
    presets?: Array<Record<string, unknown>>;
    activePreset?: string | null;
    selectedWorlds?: string[];
    persona?: { name?: string; description?: string };
  };

  // 聊天级设置（场景覆盖/作者注，来自 JSONL header）
  const chatMeta = (header.chat_metadata ?? {}) as { scenario?: string; scenario_override?: string; author_note?: string; world_id?: string | null };

  // 加载世界书（用户选中的 + 角色卡内嵌 character_book）
  const wiEntries: WorldInfoEntry[] = [];
  const selectedWorlds = settings.selectedWorlds ?? [];
  for (const worldId of selectedWorlds) {
    const wrow = getDb().prepare('SELECT * FROM worlds WHERE id = ? AND user_id = ?').get(worldId, req.user!.id) as Record<string, unknown> | undefined;
    if (!wrow) continue;
    try {
      const wtext = fs.readFileSync(path.join(config.dataDir, wrow.file_path as string), 'utf-8');
      const wi = parseWorldInfo(JSON.parse(wtext));
      wiEntries.push(...Object.values(wi.entries));
    } catch { /* 跳过损坏世界书 */ }
  }
  // 角色卡内嵌世界书（character_book）
  if (data.character_book) {
    const embedded = extractCharacterBook(data.character_book);
    if (embedded) wiEntries.push(...Object.values(embedded.entries));
  }

  // 聊天级世界书（聊天设置里选中的世界书，未在全局列表中的补充加载）
  if (chatMeta.world_id && !selectedWorlds.includes(chatMeta.world_id)) {
    try {
      const wrow = getDb().prepare('SELECT * FROM worlds WHERE id = ? AND user_id = ?').get(chatMeta.world_id, req.user!.id) as Record<string, unknown> | undefined;
      if (wrow) {
        const wtext = fs.readFileSync(path.join(config.dataDir, wrow.file_path as string), 'utf-8');
        const wi = parseWorldInfo(JSON.parse(wtext));
        wiEntries.push(...Object.values(wi.entries));
      }
    } catch { /* 跳过损坏世界书 */ }
  }
  // 作者注（聊天设置）以常驻条目注入
  const authorNote = chatMeta.author_note ?? '';
  if (authorNote) wiEntries.push({
    uid: -1,
    key: [],
    constant: true,
    content: authorNote,
    role: 0,
    order: 999,
  });
  // 世界书扫描（真实条目 + 作者注）
  const worldInfo = scanWorldInfo({
    entries: wiEntries,
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
  // 聊天级场景覆盖（有则替代角色卡 scenario）
  const scenarioOverride = chatMeta.scenario_override ?? chatMeta.scenario ?? '';
  if (scenarioOverride) promptData.scenario = scenarioOverride;
  // Persona（用户角色设定）注入
  const persona = settings.persona ?? {};
  const personaText = [persona.name, persona.description].filter(Boolean).join('\n');

  // 后端配置
  const backend = settings.backend ?? { type: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: '' };

  // 正则脚本（全局 + 角色卡 scoped）
  const regexScripts: RegexScript[] = [...(settings.regex ?? [])];
  const scopedRegex = (data.extensions?.regex_scripts as RegexScript[] | undefined) ?? [];
  regexScripts.push(...scopedRegex);

  // 预设（激活的预设提供采样参数与指令模板）
  const activePreset = settings.presets?.find((p) => p.name === settings.activePreset) as
    | { sampling?: Record<string, unknown>; instruct?: Record<string, unknown>; context?: Record<string, unknown> }
    | undefined;
  const sampling = activePreset?.sampling ?? {};
  const instruct = activePreset?.instruct ?? {};
  const context = activePreset?.context ?? {};

  // 构建 prompt（真实世界书/正则/预设/persona）
  const promptResult = buildPrompt({
    character: promptData,
    chat: messages,
    worldInfo,
    persona: personaText,
    userName: req.user!.display_name || req.user!.username,
    instruct: {
      input_sequence: (instruct.input_sequence as string) ?? '<|im_start|>user',
      output_sequence: (instruct.output_sequence as string) ?? '<|im_start|>assistant',
      system_sequence: (instruct.system_sequence as string) ?? '<|im_start|>system',
      stop_sequence: (instruct.stop_sequence as string) ?? '<|im_end|>',
      wrap: (instruct.wrap as boolean) ?? true,
      macro: (instruct.macro as boolean) ?? true,
      names_behavior: ((instruct.names_behavior as string) ?? 'force') as 'force' | 'auto' | 'none',
    },
    context: {
      story_string: (context.story_string as string) ?? '{{system}}\n{{description}}\n{{chatHistory}}',
      example_separator: (context.example_separator as string) ?? '***',
      chat_start: (context.chat_start as string) ?? '***',
    },
    maxContext: 4096,
    maxTokens: 300,
    regexScripts,
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

/** 编辑消息 */
chatsRouter.patch('/:id/messages/:idx', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const absPath = path.join(config.dataDir, row.file_path as string);
  const { header, messages } = parseChatJsonl(fs.readFileSync(absPath, 'utf-8'));
  const idx = parseInt(req.params.idx, 10);
  if (idx < 0 || idx >= messages.length) return res.status(400).json({ error: 'Message index out of range' });
  const { mes } = req.body as { mes?: string };
  if (mes === undefined) return res.status(400).json({ error: 'mes is required' });
  messages[idx].mes = mes;
  fs.writeFileSync(absPath, serializeChatJsonl(header, messages));
  return res.json({ ok: true, message: messages[idx] });
});

/** 删除消息（从 idx 起删除） */
chatsRouter.delete('/:id/messages/:idx', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const absPath = path.join(config.dataDir, row.file_path as string);
  const { header, messages } = parseChatJsonl(fs.readFileSync(absPath, 'utf-8'));
  const idx = parseInt(req.params.idx, 10);
  if (idx < 0 || idx >= messages.length) return res.status(400).json({ error: 'Message index out of range' });
  messages.splice(idx, 1);
  fs.writeFileSync(absPath, serializeChatJsonl(header, messages));
  return res.json({ ok: true });
});

/** 获取聊天设置（存 JSONL header 的 chat_metadata） */
chatsRouter.get('/:id/settings', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const absPath = path.join(config.dataDir, row.file_path as string);
  const { header } = parseChatJsonl(fs.readFileSync(absPath, 'utf-8'));
  return res.json({ settings: header.chat_metadata ?? {}, title: row.title });
});

/** 更新聊天设置（合并到 chat_metadata） */
chatsRouter.put('/:id/settings', (req, res) => {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Chat not found' });
  const absPath = path.join(config.dataDir, row.file_path as string);
  const { header, messages } = parseChatJsonl(fs.readFileSync(absPath, 'utf-8'));
  const { title, scenario_override, author_note, world_id } = req.body as {
    title?: string;
    scenario_override?: string;
    author_note?: string;
    world_id?: string | null;
  };
  header.chat_metadata = {
    ...(header.chat_metadata ?? {}),
    ...(scenario_override !== undefined ? { scenario_override } : {}),
    ...(author_note !== undefined ? { author_note } : {}),
    ...(world_id !== undefined ? { world_id } : {}),
  };
  fs.writeFileSync(absPath, serializeChatJsonl(header, messages));
  if (title !== undefined) {
    getDb().prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), row.id);
  }
  return res.json({ ok: true, settings: header.chat_metadata });
});
