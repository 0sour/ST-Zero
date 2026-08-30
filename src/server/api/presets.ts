import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

/**
 * 预设 API（存用户 settings 的 presets 字段）
 * 预设 = 采样参数 + 指令模板 + 上下文模板 的组合
 */
export const presetsRouter = Router();
presetsRouter.use(requireAuth);

function getSettings(userId: string): Record<string, unknown> {
  const row = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(userId) as { data?: string } | undefined;
  return row?.data ? JSON.parse(row.data) : {};
}

function saveSettings(userId: string, settings: Record<string, unknown>) {
  getDb()
    .prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
    .run(userId, JSON.stringify(settings));
}

/** 预设列表 */
presetsRouter.get('/', (req, res) => {
  const settings = getSettings(req.user!.id);
  const presets = (settings.presets as unknown[]) ?? [];
  return res.json({ presets, active: settings.activePreset ?? null });
});

/** 创建/保存预设 */
presetsRouter.post('/', (req, res) => {
  const { name, sampling, instruct, context } = req.body as Record<string, unknown>;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const settings = getSettings(req.user!.id);
  const presets = (settings.presets as Array<Record<string, unknown>>) ?? [];
  const existing = presets.findIndex((p) => p.name === name);
  const preset = {
    name,
    sampling: sampling ?? { temperature: 0.9, topP: 0.95, topK: 40 },
    instruct: instruct ?? {
      input_sequence: '<|im_start|>user',
      output_sequence: '<|im_start|>assistant',
      system_sequence: '<|im_start|>system',
      stop_sequence: '<|im_end|>',
      wrap: true,
      macro: true,
      names_behavior: 'force',
    },
    context: context ?? { story_string: '{{system}}\n{{description}}\n{{chatHistory}}', example_separator: '***', chat_start: '***' },
  };
  if (existing >= 0) presets[existing] = preset;
  else presets.push(preset);
  settings.presets = presets;
  saveSettings(req.user!.id, settings);
  return res.status(201).json({ preset });
});

/** 激活预设 */
presetsRouter.post('/:name/activate', (req, res) => {
  const settings = getSettings(req.user!.id);
  const presets = (settings.presets as Array<Record<string, unknown>>) ?? [];
  const preset = presets.find((p) => p.name === req.params.name);
  if (!preset) return res.status(404).json({ error: 'Preset not found' });
  settings.activePreset = req.params.name;
  saveSettings(req.user!.id, settings);
  return res.json({ ok: true, active: req.params.name });
});

/** 删除预设 */
presetsRouter.delete('/:name', (req, res) => {
  const settings = getSettings(req.user!.id);
  const presets = (settings.presets as Array<Record<string, unknown>>) ?? [];
  const filtered = presets.filter((p) => p.name !== req.params.name);
  if (filtered.length === presets.length) return res.status(404).json({ error: 'Preset not found' });
  settings.presets = filtered;
  if (settings.activePreset === req.params.name) settings.activePreset = null;
  saveSettings(req.user!.id, settings);
  return res.json({ ok: true });
});
