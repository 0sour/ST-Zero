import { describe, it, expect } from 'vitest';
import { applyRegex, RegexScript } from '@server/engine/regex';

function script(overrides: Partial<RegexScript> = {}): RegexScript {
  return {
    id: 'rx-1',
    scriptName: '测试',
    findRegex: '/foo/g',
    replaceString: 'bar',
    trimStrings: [],
    placement: [1, 2],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    ...overrides,
  };
}

describe('正则引擎', () => {
  it('基础替换', () => {
    const r = applyRegex({ text: 'foo foo', scripts: [script()], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('bar bar');
  });

  it('placement 过滤', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ placement: [2] })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('foo');
  });

  it('disabled 跳过', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ disabled: true })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('foo');
  });

  it('捕获组 $1', () => {
    const r = applyRegex({ text: 'hello world', scripts: [script({ findRegex: '/(hello) (world)/', replaceString: '$2 $1' })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('world hello');
  });

  it('{{match}} 完整匹配', () => {
    const r = applyRegex({ text: 'abc123', scripts: [script({ findRegex: '/[0-9]+/', replaceString: '[{{match}}]' })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('abc[123]');
  });

  it('trimStrings 修剪', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ findRegex: '/foo/', replaceString: 'X', trimStrings: ['X'] })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('');
  });

  it('minDepth/maxDepth 过滤', () => {
    const s = script({ minDepth: 2 });
    const r = applyRegex({ text: 'foo', scripts: [s], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('foo');
  });

  it('markdownOnly 过滤', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ markdownOnly: true })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('foo');
  });

  it('runOnEdit 允许编辑时执行', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ runOnEdit: true })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: true });
    expect(r.text).toBe('bar');
  });

  it('runOnEdit=false 编辑时跳过', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ runOnEdit: false })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: true });
    expect(r.text).toBe('foo');
  });

  it('宏替换 RAW 模式', () => {
    const r = applyRegex({ text: 'hi {{user}}', scripts: [script({ findRegex: '/{{user}}/', replaceString: 'X' })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false }, { user: '小明' });
    expect(r.text).toBe('hi X');
  });

  it('无效正则跳过不抛错', () => {
    const r = applyRegex({ text: 'foo', scripts: [script({ findRegex: '/([/' })], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.text).toBe('foo');
  });

  it('appliedScripts 记录应用脚本', () => {
    const r = applyRegex({ text: 'foo', scripts: [script()], placement: 1, depth: 0, isMarkdown: false, isPrompt: false, isEdit: false });
    expect(r.appliedScripts).toContain('测试');
  });
});
