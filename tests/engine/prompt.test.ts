import { describe, it, expect } from 'vitest';
import { buildPrompt, PromptBuildInput } from '@server/engine/prompt';

function baseInput(overrides: Partial<PromptBuildInput> = {}): PromptBuildInput {
  return {
    character: {
      name: '樱井千夏',
      description: '图书委员',
      personality: '',
      scenario: '图书馆',
      first_mes: '你好',
      mes_example: '',
    },
    chat: [],
    worldInfo: { entries: [], activated: [], worldInfoBefore: '', worldInfoAfter: '' },
    persona: '',
    userName: '小明',
    instruct: {
      input_sequence: '<|im_start|>user',
      output_sequence: '<|im_start|>assistant',
      system_sequence: '<|im_start|>system',
      stop_sequence: '<|im_end|>',
      wrap: true,
      macro: true,
      names_behavior: 'force',
    },
    context: { story_string: '{{system}}\n{{description}}\n{{chatHistory}}', example_separator: '***', chat_start: '***' },
    maxContext: 4096,
    maxTokens: 300,
    regexScripts: [],
    mode: 'chat',
    ...overrides,
  };
}

describe('prompt 构建', () => {
  it('persona 注入角色定义段', () => {
    const result = buildPrompt(baseInput({ persona: '我是旅行者，喜欢冒险。' }));
    const defMsg = result.messages.find((m) => m.role === 'system' && m.content.includes('Persona'));
    expect(defMsg).toBeDefined();
    expect(defMsg!.content).toContain('我是旅行者，喜欢冒险。');
  });

  it('persona 为空时不含 Persona 段', () => {
    const result = buildPrompt(baseInput());
    expect(result.messages.some((m) => m.content.includes('Persona'))).toBe(false);
  });

  it('聊天级场景覆盖生效（替代角色卡 scenario）', () => {
    const result = buildPrompt(baseInput({ character: { name: '樱井千夏', description: '图书委员', personality: '温柔', scenario: '角色卡场景' } }));
    const defMsg = result.messages.find((m) => m.role === 'system' && m.content.includes('Scenario'));
    expect(defMsg).toBeDefined();
    expect(defMsg!.content).toContain('Scenario: 角色卡场景');
  });
});

/** 预算极端不足时，最后一条用户消息必须保留（模型需要用户输入才能回答） */
it('预算不足时保留最后用户消息', () => {
  const result = buildPrompt(baseInput({
    chat: [
      { name: '小明', is_user: true, send_date: 1, mes: '这是一条很长的用户消息，'.repeat(200), extra: {} },
    ],
    // 压缩预算，强制裁剪
    maxContext: 2048,
    maxTokens: 1024,
    character: { name: '樱井千夏', description: '非常长的描述'.repeat(100), personality: '', scenario: '', first_mes: '', mes_example: '' },
    persona: '非常长的persona'.repeat(50),
  }));
  expect(result.messages.some((m) => m.role === 'user')).toBe(true);
});
