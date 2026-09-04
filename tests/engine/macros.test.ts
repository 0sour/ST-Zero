import { describe, it, expect } from 'vitest';
import { substituteParams, MacroContext } from '@server/engine/macros';

const ctx: MacroContext = {
  charName: '樱井千夏',
  userName: '小明',
  description: '图书委员',
  personality: '温柔',
  scenario: '图书馆',
  persona: '学生',
  wiBefore: '世界书内容',
  wiAfter: '',
  systemPrompt: '系统提示',
};

describe('宏替换', () => {
  it('基础变量宏', () => {
    expect(substituteParams('{{char}} 对 {{user}} 说', ctx)).toBe('樱井千夏 对 小明 说');
  });

  it('大小写不敏感', () => {
    expect(substituteParams('{{CHAR}} {{User}}', ctx)).toBe('樱井千夏 小明');
  });

  it('角色字段宏', () => {
    expect(substituteParams('{{description}} {{personality}} {{scenario}}', ctx)).toBe('图书委员 温柔 图书馆');
  });

  it('世界书宏', () => {
    expect(substituteParams('{{wiBefore}}', ctx)).toBe('世界书内容');
  });

  it('{{random:A,B,C}} 返回其中一个', () => {
    const result = substituteParams('{{random:红,绿,蓝}}', ctx);
    expect(['红', '绿', '蓝']).toContain(result);
  });

  it('{{roll:d6}} 返回 1-6', () => {
    const result = parseInt(substituteParams('{{roll:d6}}', ctx), 10);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(6);
  });

  it('{{reverse:abc}} 反转', () => {
    expect(substituteParams('{{reverse:abc}}', ctx)).toBe('cba');
  });

  it('{{// 注释}} 输出空', () => {
    expect(substituteParams('前{{// 注释}}后', ctx)).toBe('前后');
  });

  it('未识别宏原样保留', () => {
    expect(substituteParams('{{unknown_macro}}', ctx)).toBe('{{unknown_macro}}');
  });

  it('嵌套宏先内后外', () => {
    const result = substituteParams('{{random:{{char}},X}}', ctx);
    expect(['樱井千夏', 'X']).toContain(result);
  });

  it('自定义宏', () => {
    expect(substituteParams('{{custom}}', { ...ctx, custom: { custom: '自定义值' } })).toBe('自定义值');
  });
});
