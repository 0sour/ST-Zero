/**
 * 世界书扫描器（纯函数）
 * 算法规格见核心算法规格文档 §2
 * 参考：SillyTavern public/scripts/world-info.js
 */

import { ChatMessage } from '../format/chat.js';
import { WorldInfoEntry } from '../format/world-info.js';

export interface WorldInfoSettings {
  /** 扫描深度（默认 2） */
  depth: number;
  /** 上下文预算 %（默认 25） */
  budget: number;
  /** 扫描缓冲含名字前缀 */
  includeNames: boolean;
  /** 递归扫描 */
  recursive: boolean;
  /** 大小写敏感 */
  caseSensitive: boolean;
  /** 整词匹配 */
  matchWholeWords: boolean;
  /** 最大递归步数 */
  maxRecursionSteps: number;
  /** 最小激活数 */
  minActivations: number;
}

export const DEFAULT_WI_SETTINGS: WorldInfoSettings = {
  depth: 2,
  budget: 25,
  includeNames: true,
  recursive: false,
  caseSensitive: false,
  matchWholeWords: false,
  maxRecursionSteps: 10,
  minActivations: 0,
};

export const MAX_SCAN_DEPTH = 100;

export interface WorldInfoScanInput {
  entries: WorldInfoEntry[];
  chatMessages: ChatMessage[];
  settings: WorldInfoSettings;
  maxContext: number;
  /** 角色描述（matchCharacter* 匹配用） */
  characterDescription?: string;
  characterPersonality?: string;
  scenario?: string;
  personaDescription?: string;
}

export interface WorldInfoScanResult {
  activatedEntries: WorldInfoEntry[];
  worldInfoBefore: string;
  worldInfoAfter: string;
  worldInfoExamples: WorldInfoEntry[];
  worldInfoDepth: WorldInfoEntry[];
  anBefore: WorldInfoEntry[];
  anAfter: WorldInfoEntry[];
  outletEntries: Record<string, WorldInfoEntry[]>;
  tokenCount: number;
}

/** 位置枚举（与 ST 一致） */
export const POSITION = {
  BEFORE_CHAR: 0,
  AFTER_CHAR: 1,
  AN_TOP: 2,
  AN_BOTTOM: 3,
  AT_DEPTH: 4,
  EM_TOP: 5,
  EM_BOTTOM: 6,
  OUTLET: 7,
} as const;

/** 构建扫描缓冲（消息加名字前缀，\x01 分隔） */
function buildDepthBuffer(messages: ChatMessage[], includeNames: boolean): string[] {
  return messages.map((m) => {
    const name = m.name || (m.is_user ? 'You' : 'Character');
    return includeNames ? `${name}: ${m.mes ?? ''}` : (m.mes ?? '');
  });
}

/** 关键词匹配（支持正则 /pattern/flags） */
function matchKeys(keys: string[], text: string, caseSensitive: boolean, wholeWords: boolean): boolean {
  const haystack = caseSensitive ? text : text.toLowerCase();
  for (const raw of keys) {
    const key = raw.trim();
    if (!key) continue;
    // 正则键：/pattern/flags 形式
    if (key.startsWith('/') && key.lastIndexOf('/') > 0) {
      const lastSlash = key.lastIndexOf('/');
      const pattern = key.slice(1, lastSlash);
      const flags = key.slice(lastSlash + 1);
      try {
        const re = new RegExp(pattern, flags + (caseSensitive ? '' : 'i'));
        if (re.test(text)) return true;
      } catch {
        // 无效正则按字面处理
      }
      continue;
    }
    const needle = caseSensitive ? key : key.toLowerCase();
    if (wholeWords) {
      const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? '' : 'i');
      if (re.test(text)) return true;
    } else if (haystack.includes(needle)) {
      return true;
    }
  }
  return false;
}

/** 选择性逻辑：0=AND ANY, 1=AND ALL, 2=NOT ANY, 3=NOT ALL */
function checkSelective(entry: WorldInfoEntry, text: string, caseSensitive: boolean, wholeWords: boolean): boolean {
  const keys = entry.key ?? [];
  const secondary = entry.keysecondary ?? [];
  const logic = entry.selectiveLogic ?? 0;
  const primaryHit = matchKeys(keys, text, caseSensitive, wholeWords);
  const secondaryHit = matchKeys(secondary, text, caseSensitive, wholeWords);
  switch (logic) {
    case 0: return primaryHit && (secondary.length === 0 || secondaryHit);
    case 1: return primaryHit && secondaryHit;
    case 2: return primaryHit && !secondaryHit;
    case 3: return primaryHit && !secondaryHit;
    default: return primaryHit;
  }
}

/** 估算 token 数（字节/3.35，ST 同款兜底） */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf-8') / 3.35);
}

/**
 * 世界书扫描主流程
 * 1. 构建扫描缓冲 → 2. 关键词匹配 → 3. 递归扫描 → 4. 预算裁剪 → 5. 位置分配
 */
export function scanWorldInfo(input: WorldInfoScanInput): WorldInfoScanResult {
  const { entries, chatMessages, settings, maxContext } = input;
  const buffer = buildDepthBuffer(chatMessages, settings.includeNames);
  const scanText = buffer.slice(-settings.depth).join('\x01');
  const caseSensitive = settings.caseSensitive;
  const wholeWords = settings.matchWholeWords;

  // 1. 关键词匹配
  const activated: WorldInfoEntry[] = [];
  for (const entry of entries) {
    if (entry.disable) continue;
    if (entry.constant) {
      activated.push(entry);
      continue;
    }
    const keys = entry.key ?? [];
    if (keys.length === 0) continue;
    if (entry.selective === false) {
      if (matchKeys(keys, scanText, caseSensitive, wholeWords)) activated.push(entry);
    } else if (checkSelective(entry, scanText, caseSensitive, wholeWords)) {
      activated.push(entry);
    }
  }

  // 2. 递归扫描
  if (settings.recursive) {
    let steps = 0;
    let changed = true;
    while (changed && steps < settings.maxRecursionSteps) {
      changed = false;
      const recurseText = activated.map((e) => e.content ?? '').join('\n');
      for (const entry of entries) {
        if (entry.disable || entry.excludeRecursion) continue;
        if (activated.includes(entry)) continue;
        const keys = entry.key ?? [];
        if (keys.length === 0) continue;
        if (matchKeys(keys, recurseText, caseSensitive, wholeWords)) {
          activated.push(entry);
          changed = true;
        }
      }
      steps++;
    }
  }

  // 3. 预算裁剪（按 priority 从小到大丢弃，ignoreBudget 豁免）
  const budgetTokens = Math.floor((maxContext * settings.budget) / 100);
  let total = activated.reduce((sum, e) => sum + estimateTokens(e.content ?? ''), 0);
  if (total > budgetTokens) {
    const sorted = [...activated].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    const kept: WorldInfoEntry[] = [];
    for (const e of sorted) {
      if (e.ignoreBudget) {
        kept.push(e);
        continue;
      }
      const t = estimateTokens(e.content ?? '');
      if (total <= budgetTokens) {
        kept.push(e);
      } else {
        total -= t;
      }
    }
    activated.length = 0;
    activated.push(...kept);
  }

  // 4. 按插入顺序排序
  activated.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

  // 5. 位置分配
  const result: WorldInfoScanResult = {
    activatedEntries: activated,
    worldInfoBefore: '',
    worldInfoAfter: '',
    worldInfoExamples: [],
    worldInfoDepth: [],
    anBefore: [],
    anAfter: [],
    outletEntries: {},
    tokenCount: 0,
  };
  for (const e of activated) {
    const pos = e.position ?? POSITION.BEFORE_CHAR;
    const content = e.content ?? '';
    switch (pos) {
      case POSITION.BEFORE_CHAR: result.worldInfoBefore += content + '\n'; break;
      case POSITION.AFTER_CHAR: result.worldInfoAfter += content + '\n'; break;
      case POSITION.AN_TOP: result.anBefore.push(e); break;
      case POSITION.AN_BOTTOM: result.anAfter.push(e); break;
      case POSITION.AT_DEPTH: result.worldInfoDepth.push(e); break;
      case POSITION.EM_TOP:
      case POSITION.EM_BOTTOM: result.worldInfoExamples.push(e); break;
      case POSITION.OUTLET: {
        const name = (e.extensions?.outlet_name as string) || 'default';
        (result.outletEntries[name] ??= []).push(e);
        break;
      }
    }
  }
  result.tokenCount = activated.reduce((sum, e) => sum + estimateTokens(e.content ?? ''), 0);
  return result;
}
