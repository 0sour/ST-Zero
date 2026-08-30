import { describe, it, expect } from 'vitest';
import { createHeader, parseChatJsonl, serializeChatJsonl, isValidMessageLine } from '@server/format/chat';

describe('聊天 JSONL', () => {
  it('序列化 → 解析 往返不变量（含 extra）', () => {
    const header = createHeader({ scenario: '测试场景' });
    const messages = [
      { name: '樱井千夏', is_user: false, send_date: 1000, mes: '你好', extra: { api: 'openai', model: 'qwen' } },
      { name: '你', is_user: true, send_date: 2000, mes: '嗨', swipes: ['备选1', '备选2'], swipe_id: 1 },
    ];
    const text = serializeChatJsonl(header, messages);
    const { header: h2, messages: m2 } = parseChatJsonl(text);
    expect(h2.chat_metadata.scenario).toBe('测试场景');
    expect(m2.length).toBe(2);
    expect(m2[0].extra).toEqual({ api: 'openai', model: 'qwen' });
    expect(m2[1].swipes).toEqual(['备选1', '备选2']);
    expect(m2[1].swipe_id).toBe(1);
  });

  it('空聊天返回空 header', () => {
    const { header, messages } = parseChatJsonl('');
    expect(header.user_name).toBe('unused');
    expect(messages).toEqual([]);
  });

  it('损坏行跳过不中断', () => {
    const text = '{"chat_metadata":{},"user_name":"unused","character_name":"unused"}\n{broken json}\n{"name":"A","mes":"ok"}';
    const { messages } = parseChatJsonl(text);
    expect(messages.length).toBe(1);
    expect(messages[0].name).toBe('A');
  });

  it('isValidMessageLine 校验规则', () => {
    expect(isValidMessageLine('{"name":"A"}')).toBe(true);
    expect(isValidMessageLine('{"chat_metadata":{}}')).toBe(true);
    expect(isValidMessageLine('{"foo":1}')).toBe(false);
  });
});
