/**
 * 世界书（World Info / Lorebook）解析
 * 格式：{ name, entries: { uid: entry }, extensions }
 * 关键：entries 是以 uid 为键的对象（不是数组）
 * 字段映射见格式兼容层设计文档 §3.2
 */

export interface WorldInfoEntry {
  uid: number;
  key?: string[];
  keysecondary?: string[];
  comment?: string;
  content?: string;
  constant?: boolean;
  selective?: boolean;
  selectiveLogic?: number;
  order?: number;
  position?: number;
  disable?: boolean;
  probability?: number;
  useProbability?: boolean;
  depth?: number;
  group?: string;
  groupOverride?: boolean;
  groupWeight?: number;
  role?: number;
  scanDepth?: number | null;
  caseSensitive?: boolean | null;
  matchWholeWords?: boolean | null;
  useGroupScoring?: boolean | null;
  automationId?: string;
  sticky?: number | null;
  cooldown?: number | null;
  delay?: number | null;
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
  delayUntilRecursion?: boolean;
  ignoreBudget?: boolean;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorldInfoFile {
  name?: string;
  entries: Record<string, WorldInfoEntry>;
  extensions?: Record<string, unknown>;
}

/** 解析世界书 JSON（兼容 entries 为数组或对象两种形态） */
export function parseWorldInfo(json: unknown): WorldInfoFile {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Invalid world info file');
  }
  const obj = json as Record<string, unknown>;
  const entries: Record<string, WorldInfoEntry> = {};
  if (Array.isArray(obj.entries)) {
    (obj.entries as WorldInfoEntry[]).forEach((e, i) => {
      const uid = e.uid ?? i;
      entries[String(uid)] = { ...e, uid };
    });
  } else if (obj.entries && typeof obj.entries === 'object') {
    for (const [k, v] of Object.entries(obj.entries as Record<string, unknown>)) {
      entries[k] = { ...(v as WorldInfoEntry), uid: (v as WorldInfoEntry).uid ?? Number(k) };
    }
  }
  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    entries,
    extensions: (obj.extensions as Record<string, unknown>) ?? {},
  };
}

/** 序列化世界书（entries 为 uid 键控对象） */
export function serializeWorldInfo(wi: WorldInfoFile): string {
  return JSON.stringify(
    {
      name: wi.name,
      entries: wi.entries,
      extensions: wi.extensions ?? {},
    },
    null,
    2,
  );
}

/** 从角色卡 character_book 提取世界书 */
export function extractCharacterBook(book: unknown): WorldInfoFile | null {
  if (typeof book !== 'object' || book === null) return null;
  const b = book as Record<string, unknown>;
  if (!Array.isArray(b.entries)) return null;
  return parseWorldInfo(b);
}
