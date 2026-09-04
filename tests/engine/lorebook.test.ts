import { describe, it, expect } from 'vitest';
import { scanWorldInfo, DEFAULT_WI_SETTINGS, POSITION, estimateTokens } from '@server/engine/lorebook';

const chat = [
  { name: '樱井千夏', is_user: false, mes: '啊，你来了。今天图书馆没什么人。' },
  { name: '你', is_user: true, mes: '你好，图书馆今天有什么书？' },
];

function entry(overrides: Record<string, unknown> = {}) {
  return { uid: 0, key: [], content: '', order: 100, constant: false, ...overrides };
}

describe('世界书扫描', () => {
  it('关键词命中激活', () => {
    const result = scanWorldInfo({
      entries: [entry({ uid: 0, key: ['图书馆'], content: '图书馆的秘密' })],
      chatMessages: chat,
      settings: DEFAULT_WI_SETTINGS,
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(1);
    expect(result.worldInfoBefore).toContain('图书馆的秘密');
  });

  it('关键词未命中不激活', () => {
    const result = scanWorldInfo({
      entries: [entry({ uid: 0, key: ['雾之馆'], content: '雾之馆的秘密' })],
      chatMessages: chat,
      settings: DEFAULT_WI_SETTINGS,
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(0);
  });

  it('大小写敏感设置', () => {
    const result = scanWorldInfo({
      entries: [entry({ uid: 0, key: ['LIBRARY'], content: '英文关键词' })],
      chatMessages: chat,
      settings: { ...DEFAULT_WI_SETTINGS, caseSensitive: true },
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(0);
  });

  it('正则键匹配', () => {
    const result = scanWorldInfo({
      entries: [entry({ uid: 0, key: ['/图书.+?/'], content: '正则命中' })],
      chatMessages: chat,
      settings: DEFAULT_WI_SETTINGS,
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(1);
  });

  it('constant 条目始终激活', () => {
    const result = scanWorldInfo({
      entries: [entry({ uid: 0, constant: true, content: '常驻内容' })],
      chatMessages: chat,
      settings: DEFAULT_WI_SETTINGS,
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(1);
  });

  it('disable 条目不激活', () => {
    const result = scanWorldInfo({
      entries: [entry({ uid: 0, key: ['图书馆'], content: 'x', disable: true })],
      chatMessages: chat,
      settings: DEFAULT_WI_SETTINGS,
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(0);
  });

  it('位置分配：before_char / after_char / atDepth', () => {
    const result = scanWorldInfo({
      entries: [
        entry({ uid: 0, key: ['图书馆'], content: '前', position: POSITION.BEFORE_CHAR }),
        entry({ uid: 1, key: ['图书馆'], content: '后', position: POSITION.AFTER_CHAR }),
        entry({ uid: 2, key: ['图书馆'], content: '深', position: POSITION.AT_DEPTH }),
      ],
      chatMessages: chat,
      settings: DEFAULT_WI_SETTINGS,
      maxContext: 4096,
    });
    expect(result.worldInfoBefore).toContain('前');
    expect(result.worldInfoAfter).toContain('后');
    expect(result.worldInfoDepth.length).toBe(1);
  });

  it('预算裁剪：超预算丢弃低优先级', () => {
    const result = scanWorldInfo({
      entries: [
        entry({ uid: 0, key: ['图书馆'], content: 'A'.repeat(500), order: 100 }),
        entry({ uid: 1, key: ['图书馆'], content: 'B'.repeat(500), order: 200 }),
      ],
      chatMessages: chat,
      settings: { ...DEFAULT_WI_SETTINGS, budget: 1 },
      maxContext: 100,
    });
    expect(result.activatedEntries.length).toBeLessThanOrEqual(1);
  });

  it('递归扫描激活关联条目', () => {
    const result = scanWorldInfo({
      entries: [
        entry({ uid: 0, key: ['图书馆'], content: '提到雾之馆' }),
        entry({ uid: 1, key: ['雾之馆'], content: '雾之馆的真相' }),
      ],
      chatMessages: chat,
      settings: { ...DEFAULT_WI_SETTINGS, recursive: true },
      maxContext: 4096,
    });
    expect(result.activatedEntries.length).toBe(2);
  });

  it('estimateTokens 估算', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello')).toBeGreaterThan(0);
  });
});

/** 预算裁剪：保留 order 小（优先级高）的条目，丢弃超预算的低优先级条目 */
it('预算裁剪保留优先级高的条目', () => {
  const entries: WorldInfoEntry[] = [
    { uid: 1, key: ['甲'], content: 'A'.repeat(3000), order: 500 },  // 超预算且 order 大，应被丢弃
    { uid: 2, key: ['乙'], content: 'B'.repeat(3000), order: 100 },  // 超预算但 order 小，应保留
  ];
  const result = scanWorldInfo({ entries, chatMessages: [{ name: 'u', is_user: true, mes: '甲乙' }], settings: DEFAULT_WI_SETTINGS, maxContext: 4096 });
  const uids = result.activatedEntries.map((e) => e.uid);
  expect(uids).toContain(2);
  expect(uids).not.toContain(1);
});

/** 常驻条目始终注入，不受预算限制 */
it('常驻条目豁免预算始终注入', () => {
  const entries: WorldInfoEntry[] = [
    { uid: 1, key: [], constant: true, content: 'C'.repeat(800), order: 100 },
    { uid: 2, key: ['关键词'], content: 'D'.repeat(800), order: 100 },
  ];
  const result = scanWorldInfo({ entries, chatMessages: [{ name: 'u', is_user: true, mes: '关键词' }], settings: DEFAULT_WI_SETTINGS, maxContext: 4096 });
  const uids = result.activatedEntries.map((e) => e.uid);
  expect(uids).toContain(1);
});
