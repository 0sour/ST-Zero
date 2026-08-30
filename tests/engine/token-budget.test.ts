import { describe, it, expect } from 'vitest';
import { allocateBudget, estimateTokens, PromptBlock } from '@server/engine/token-budget';

function block(id: string, content: string, fixed = false, priority = 100): PromptBlock {
  return { id, content, fixed, priority };
}

describe('Token 预算', () => {
  it('固定块全部保留', () => {
    const result = allocateBudget(
      [block('system', '系统提示', true), block('chat', '聊天内容')],
      1000,
    );
    expect(result.blocks.some((b) => b.id === 'system')).toBe(true);
  });

  it('弹性块超预算被裁剪', () => {
    const result = allocateBudget(
      [block('a', 'A'.repeat(1000)), block('b', 'B'.repeat(1000))],
      500,
    );
    expect(result.blocks.length).toBeLessThan(2);
  });

  it('聊天历史从最旧裁剪', () => {
    const history = ['旧消息1', '旧消息2', '新消息3'].join('\n');
    const result = allocateBudget([block('chatHistory', history)], 100);
    // 保留的内容应包含最新消息
    expect(result.blocks[0]?.content ?? '').toContain('新消息3');
  });

  it('estimateTokens 估算', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
  });
});
