import { describe, it, expect } from 'vitest';
import { parseWorldInfo, serializeWorldInfo, extractCharacterBook } from '@server/format/world-info';

describe('世界书解析', () => {
  it('entries 为 uid 键控对象', () => {
    const wi = parseWorldInfo({
      name: '测试世界',
      entries: {
        '0': { uid: 0, key: ['图书馆'], content: '内容A' },
        '1': { uid: 1, key: ['雾之馆'], content: '内容B' },
      },
    });
    expect(Object.keys(wi.entries).length).toBe(2);
    expect(wi.entries['0'].content).toBe('内容A');
    expect(wi.entries['1'].uid).toBe(1);
  });

  it('兼容 entries 为数组', () => {
    const wi = parseWorldInfo({
      entries: [
        { key: ['A'], content: 'a' },
        { key: ['B'], content: 'b' },
      ],
    });
    expect(Object.keys(wi.entries).length).toBe(2);
    expect(wi.entries['0'].uid).toBe(0);
    expect(wi.entries['1'].uid).toBe(1);
  });

  it('序列化 → 解析 往返不变量', () => {
    const wi = {
      name: '测试',
      entries: {
        '0': { uid: 0, key: ['图书馆'], content: '内容', order: 100, constant: false, extensions: { custom: 1 } },
      },
      extensions: { global: true },
    };
    const text = serializeWorldInfo(parseWorldInfo(wi));
    const parsed = parseWorldInfo(JSON.parse(text));
    expect(parsed.entries['0'].key).toEqual(['图书馆']);
    expect(parsed.entries['0'].extensions).toEqual({ custom: 1 });
    expect(parsed.extensions).toEqual({ global: true });
  });

  it('非法输入抛错', () => {
    expect(() => parseWorldInfo(null)).toThrow();
    expect(() => parseWorldInfo('string')).toThrow();
  });

  it('extractCharacterBook 提取内嵌世界书', () => {
    const book = {
      name: '内嵌世界',
      entries: [{ keys: ['k'], content: 'c' }],
    };
    const wi = extractCharacterBook(book);
    expect(wi).not.toBeNull();
    expect(Object.keys(wi!.entries).length).toBe(1);
  });

  it('extractCharacterBook 非法输入返回 null', () => {
    expect(extractCharacterBook(null)).toBeNull();
    expect(extractCharacterBook({})).toBeNull();
  });
});
