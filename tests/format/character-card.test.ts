import { describe, it, expect } from 'vitest';
import { detectSpec, v1ToV2, normalizeToV2, toExportV2, getCharacterName } from '@server/format/character-card';

describe('角色卡解析', () => {
  it('V1 检测', () => {
    expect(detectSpec({ name: '角色', description: '描述' })).toBe('v1');
  });

  it('V2 检测', () => {
    expect(detectSpec({ spec: 'chara_card_v2', spec_version: '2.0', data: {} })).toBe('v2');
  });

  it('V3 检测', () => {
    expect(detectSpec({ spec: 'chara_card_v3', spec_version: '3.0', data: {} })).toBe('v3');
  });

  it('未知格式检测', () => {
    expect(detectSpec(null)).toBe('unknown');
    expect(detectSpec({ foo: 'bar' })).toBe('unknown');
  });

  it('V1 → V2 转换保留未知字段', () => {
    const v1 = { name: '角色', description: '描述', personality: '人格', scenario: '场景', first_mes: '开场', mes_example: '示例', custom_field: '保留我' };
    const v2 = v1ToV2(v1);
    expect(v2.spec).toBe('chara_card_v2');
    expect(v2.data.name).toBe('角色');
    expect(v2.data.custom_field).toBe('保留我');
  });

  it('normalizeToV2 统一 V1/V2/V3', () => {
    const v1 = normalizeToV2({ name: 'A', description: 'd' });
    const v2 = normalizeToV2({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'B' } });
    const v3 = normalizeToV2({ spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'C', nickname: '小C' } });
    expect(v1.spec).toBe('chara_card_v2');
    expect(v2.data.name).toBe('B');
    expect(v3.data.name).toBe('C');
    expect(v3.data.nickname).toBe('小C');
  });

  it('normalizeToV2 未知格式抛错', () => {
    expect(() => normalizeToV2({ foo: 1 })).toThrow();
  });

  it('导出剥离私有字段 fav/chat', () => {
    const card = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: '角色', extensions: { fav: true, chat: 'x', talkativeness: 0.5 } },
    };
    const exported = toExportV2(card);
    expect(exported.data.extensions!.fav).toBeUndefined();
    expect(exported.data.extensions!.chat).toBeUndefined();
    expect(exported.data.extensions!.talkativeness).toBe(0.5);
  });

  it('getCharacterName 返回名称', () => {
    expect(getCharacterName({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: '樱井千夏' } })).toBe('樱井千夏');
  });
});
