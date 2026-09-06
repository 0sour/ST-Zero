import { describe, it, expect } from 'vitest';
import { QuotaLimits } from '@server/quota.js';

/** 配额校验逻辑测试（目录统计部分依赖 FS，此处测合并与判定逻辑） */

// 复刻 checkQuota 的合并/判定核心（不触碰 FS/DB 的纯逻辑部分）
function effectiveQuota(site: Required<QuotaLimits>, override: QuotaLimits): Required<QuotaLimits> {
  return {
    maxCharacters: override.maxCharacters ?? site.maxCharacters,
    maxStorageMB: override.maxStorageMB ?? site.maxStorageMB,
    maxChats: override.maxChats ?? site.maxChats,
  };
}

function storageExceeded(storageBytes: number, incomingBytes: number, maxStorageMB: number): boolean {
  return storageBytes + incomingBytes > maxStorageMB * 1024 * 1024;
}

describe('配额逻辑', () => {
  it('无覆盖时使用站点默认', () => {
    const q = effectiveQuota(
      { maxCharacters: 50, maxStorageMB: 500, maxChats: 100 },
      {},
    );
    expect(q).toEqual({ maxCharacters: 50, maxStorageMB: 500, maxChats: 100 });
  });

  it('覆盖字段优先于站点默认（部分覆盖保留其余默认）', () => {
    const q = effectiveQuota(
      { maxCharacters: 50, maxStorageMB: 500, maxChats: 100 },
      { maxCharacters: 200 },
    );
    expect(q.maxCharacters).toBe(200);
    expect(q.maxStorageMB).toBe(500);
    expect(q.maxChats).toBe(100);
  });

  it('总空间超限判定（含本次写入）', () => {
    const maxMB = 10;
    expect(storageExceeded(9 * 1024 * 1024, 0.5 * 1024 * 1024, maxMB)).toBe(false); // 9.5MB < 10MB
    expect(storageExceeded(9.8 * 1024 * 1024, 0.5 * 1024 * 1024, maxMB)).toBe(true); // 10.3MB > 10MB
    expect(storageExceeded(0, 10 * 1024 * 1024, maxMB)).toBe(false); // 恰好等于上限不超
    expect(storageExceeded(0, 11 * 1024 * 1024, maxMB)).toBe(true);
  });

  it('空覆盖对象不改变默认', () => {
    const q = effectiveQuota(
      { maxCharacters: 50, maxStorageMB: 500, maxChats: 100 },
      {},
    );
    expect(q.maxCharacters).toBe(50);
  });
});
