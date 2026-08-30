import { describe, it, expect } from 'vitest';
import { crc32, readTextChunks, readCharacterCardJson, writeCharacterCardJson } from '@server/format/png';

/** 1x1 透明 PNG（无 tEXt chunk） */
const BASE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
);

describe('PNG tEXt chunk', () => {
  it('CRC-32 计算正确', () => {
    // 已知值：空 buffer 的 CRC-32 为 0
    expect(crc32(Buffer.alloc(0))).toBe(0);
    // '123456789' 的 CRC-32 为 0xCBF43926
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('读取无 tEXt 的 PNG 返回空数组', () => {
    expect(readTextChunks(BASE_PNG)).toEqual([]);
  });

  it('写入 chara chunk 后可读回（往返不变量）', () => {
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '测试角色' } };
    const written = writeCharacterCardJson(BASE_PNG, card, 'chara');
    const parsed = readCharacterCardJson(written);
    expect(parsed).not.toBeNull();
    expect(parsed!.spec).toBe('chara_card_v2');
    expect((parsed!.json as { data: { name: string } }).data.name).toBe('测试角色');
  });

  it('重复写入替换旧 chunk（不残留）', () => {
    const card1 = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '角色A' } };
    const card2 = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '角色B' } };
    const once = writeCharacterCardJson(BASE_PNG, card1, 'chara');
    const twice = writeCharacterCardJson(once, card2, 'chara');
    const chunks = readTextChunks(twice);
    const charaChunks = chunks.filter((c) => c.keyword === 'chara');
    expect(charaChunks.length).toBe(1);
    const parsed = readCharacterCardJson(twice);
    expect((parsed!.json as { data: { name: string } }).data.name).toBe('角色B');
  });

  it('ccv3 优先于 chara', () => {
    const v2 = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'V2' } };
    const v3 = { spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'V3' } };
    let png = writeCharacterCardJson(BASE_PNG, v2, 'chara');
    png = writeCharacterCardJson(png, v3, 'ccv3');
    const parsed = readCharacterCardJson(png);
    expect(parsed!.spec).toBe('chara_card_v3');
    expect((parsed!.json as { data: { name: string } }).data.name).toBe('V3');
  });

  it('非法 PNG 抛错', () => {
    expect(() => readTextChunks(Buffer.from('not a png'))).toThrow();
  });
});
