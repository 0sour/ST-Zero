import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

/**
 * 正则脚本 API（存用户 settings.json 的 regex 字段）
 * 与 ST 兼容：global 脚本存 settings，scoped 存角色卡 extensions.regex_scripts
 */
export const regexRouter = Router();
regexRouter.use(requireAuth);

function getSettings(userId: string): Record<string, unknown> {
  const row = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(userId) as { data?: string } | undefined;
  return row?.data ? JSON.parse(row.data) : {};
}

function saveSettings(userId: string, settings: Record<string, unknown>) {
  getDb()
    .prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
    .run(userId, JSON.stringify(settings));
}

/** 正则列表 */
regexRouter.get('/', (req, res) => {
  const settings = getSettings(req.user!.id);
  const scripts = (settings.regex as unknown[]) ?? [];
  return res.json({ scripts });
});

/** 创建正则脚本 */
regexRouter.post('/', (req, res) => {
  const { scriptName, findRegex, replaceString, trimStrings, placement, disabled, markdownOnly, promptOnly, runOnEdit, substituteRegex, minDepth, maxDepth } = req.body as Record<string, unknown>;
  if (!scriptName) return res.status(400).json({ error: 'scriptName is required' });
  const script = {
    id: 'rx-' + Date.now(),
    scriptName,
    findRegex: findRegex ?? '',
    replaceString: replaceString ?? '',
    trimStrings: Array.isArray(trimStrings) ? trimStrings : [],
    placement: Array.isArray(placement) ? placement : [1, 2],
    disabled: !!disabled,
    markdownOnly: !!markdownOnly,
    promptOnly: !!promptOnly,
    runOnEdit: !!runOnEdit,
    substituteRegex: substituteRegex ?? 0,
    minDepth: minDepth ?? null,
    maxDepth: maxDepth ?? null,
  };
  const settings = getSettings(req.user!.id);
  const scripts = (settings.regex as unknown[]) ?? [];
  scripts.push(script);
  settings.regex = scripts;
  saveSettings(req.user!.id, settings);
  return res.status(201).json({ script });
});

/** 更新正则脚本 */
regexRouter.put('/:id', (req, res) => {
  const settings = getSettings(req.user!.id);
  const scripts = (settings.regex as Array<Record<string, unknown>>) ?? [];
  const idx = scripts.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Script not found' });
  scripts[idx] = { ...scripts[idx], ...(req.body as Record<string, unknown>), id: req.params.id };
  settings.regex = scripts;
  saveSettings(req.user!.id, settings);
  return res.json({ script: scripts[idx] });
});

/** 删除正则脚本 */
regexRouter.delete('/:id', (req, res) => {
  const settings = getSettings(req.user!.id);
  const scripts = (settings.regex as Array<Record<string, unknown>>) ?? [];
  const filtered = scripts.filter((s) => s.id !== req.params.id);
  if (filtered.length === scripts.length) return res.status(404).json({ error: 'Script not found' });
  settings.regex = filtered;
  saveSettings(req.user!.id, settings);
  return res.json({ ok: true });
});

/** 导入正则脚本（JSON 数组或单个对象） */
regexRouter.post('/import', (req, res) => {
  const body = req.body as unknown;
  const incoming = Array.isArray(body) ? body : [body];
  const settings = getSettings(req.user!.id);
  const scripts = (settings.regex as unknown[]) ?? [];
  for (const s of incoming) {
    const obj = s as Record<string, unknown>;
    if (!obj.scriptName) continue;
    scripts.push({
      id: 'rx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      scriptName: obj.scriptName,
      findRegex: obj.findRegex ?? '',
      replaceString: obj.replaceString ?? '',
      trimStrings: Array.isArray(obj.trimStrings) ? obj.trimStrings : [],
      placement: Array.isArray(obj.placement) ? obj.placement : [1, 2],
      disabled: !!obj.disabled,
      markdownOnly: !!obj.markdownOnly,
      promptOnly: !!obj.promptOnly,
      runOnEdit: !!obj.runOnEdit,
      substituteRegex: obj.substituteRegex ?? 0,
      minDepth: obj.minDepth ?? null,
      maxDepth: obj.maxDepth ?? null,
    });
  }
  settings.regex = scripts;
  saveSettings(req.user!.id, settings);
  return res.status(201).json({ ok: true, count: incoming.length });
});
