/**
 * 多用户数据配额（纯函数 + 目录统计）
 * 计量维度：角色卡数量（个）、总存储空间（字节）、聊天场次（个）
 * 配额模型：站点默认（site_settings.defaultQuota）→ 用户覆盖（settings.quota）→ admin 豁免
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getDb } from './db.js';

export interface QuotaLimits {
  maxCharacters?: number; // 角色卡数量上限（个）
  maxStorageMB?: number;  // 总存储空间上限（MB）
  maxChats?: number;      // 聊天场次上限（个）
}

export interface UserUsage {
  charactersCount: number;
  chatsCount: number;
  storageBytes: number;
}

/** 递归统计目录内全部文件字节 */
function dirSize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(full);
    else {
      try { total += fs.statSync(full).size; } catch { /* 跳过 */ }
    }
  }
  return total;
}

/** 统计用户实际占用（DB 计数 + 目录扫描） */
export function getUserUsage(userId: string): UserUsage {
  const db = getDb();
  const charactersCount = (db.prepare('SELECT COUNT(*) c FROM characters WHERE user_id = ?').get(userId) as { c: number }).c;
  const chatsCount = (db.prepare('SELECT COUNT(*) c FROM chats WHERE user_id = ?').get(userId) as { c: number }).c;
  const storageBytes = dirSize(path.join(config.dataDir, 'users', userId));
  return { charactersCount, chatsCount, storageBytes };
}

/** 读站点默认配额 */
export function getSiteDefaultQuota(): Required<QuotaLimits> {
  const row = getDb().prepare("SELECT value FROM site_settings WHERE key = 'defaultQuota'").get() as { value: string } | undefined;
  if (row) {
    try {
      const q = JSON.parse(row.value) as QuotaLimits;
      return {
        maxCharacters: Number(q.maxCharacters ?? 50),
        maxStorageMB: Number(q.maxStorageMB ?? 500),
        maxChats: Number(q.maxChats ?? 100),
      };
    } catch { /* 解析失败用默认 */ }
  }
  return { maxCharacters: 50, maxStorageMB: 500, maxChats: 100 };
}

/** 读用户覆盖配额（settings.quota） */
export function getUserQuotaOverride(userId: string): QuotaLimits {
  const row = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(userId) as { data?: string } | undefined;
  if (!row?.data) return {};
  try {
    const s = JSON.parse(row.data) as { quota?: QuotaLimits };
    return s.quota ?? {};
  } catch {
    return {};
  }
}

/** 合并计算有效配额（用户覆盖优先，未覆盖字段用站点默认） */
export function getEffectiveQuota(userId: string): Required<QuotaLimits> {
  const site = getSiteDefaultQuota();
  const override = getUserQuotaOverride(userId);
  return {
    maxCharacters: override.maxCharacters ?? site.maxCharacters,
    maxStorageMB: override.maxStorageMB ?? site.maxStorageMB,
    maxChats: override.maxChats ?? site.maxChats,
  };
}

/** 判断用户是否豁免配额（管理员） */
export function isQuotaExempt(userId: string): boolean {
  const u = getDb().prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  return u?.role === 'admin';
}

/**
 * 配额校验：返回错误信息（null = 通过）
 * incomingBytes：本次操作将要写入的预估字节数（如上传文件大小）
 */
export function checkQuota(userId: string, incomingBytes = 0): string | null {
  if (isQuotaExempt(userId)) return null;
  const quota = getEffectiveQuota(userId);
  const usage = getUserUsage(userId);

  const totalAfter = usage.storageBytes + incomingBytes;
  if (totalAfter > quota.maxStorageMB * 1024 * 1024) {
    const usedMB = (usage.storageBytes / 1024 / 1024).toFixed(1);
    return `存储空间不足：已用 ${usedMB}MB / 上限 ${quota.maxStorageMB}MB，本次需写入约 ${(incomingBytes / 1024 / 1024).toFixed(1)}MB`;
  }

  if (usage.chatsCount >= quota.maxChats) {
    return `聊天场次已达上限（${quota.maxChats} 个），请删除旧聊天后再试`;
  }
  return null;
}

/** 校验角色卡数量上限（独立于总空间） */
export function checkCharacterQuota(userId: string): string | null {
  if (isQuotaExempt(userId)) return null;
  const quota = getEffectiveQuota(userId);
  const count = (getDb().prepare('SELECT COUNT(*) c FROM characters WHERE user_id = ?').get(userId) as { c: number }).c;
  if (count >= quota.maxCharacters) {
    return `角色卡数量已达上限（${quota.maxCharacters} 张），请删除旧角色卡后再试`;
  }
  return null;
}
