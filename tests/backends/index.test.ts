import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateChatCompletion } from '@server/backends/index.js';

describe('后端适配器', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function captureUrl(backend: { type: 'openai' | 'ollama' | 'text'; baseUrl: string; model: string; apiKey: string }) {
    let captured = '';
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      captured = String(url);
      return new Response(mockStream, { status: 200 });
    }));
    const gen = generateChatCompletion(backend, [{ role: 'user', content: 'hi' }], { maxTokens: 100 });
    for await (const _ of gen) { /* consume */ }
    return captured;
  }

  it('ollama 类型：根地址自动补 /v1', async () => {
    const url = await captureUrl({ type: 'ollama', baseUrl: 'https://ollama.com/api', model: 'llama3.2', apiKey: '' });
    expect(url).toBe('https://ollama.com/api/v1/chat/completions');
  });

  it('ollama 类型：已带 /v1 不重复补', async () => {
    const url = await captureUrl({ type: 'ollama', baseUrl: 'https://api.ollama.com/v1', model: 'llama3.2', apiKey: '' });
    expect(url).toBe('https://api.ollama.com/v1/chat/completions');
  });

  it('openai 类型：不补 /v1，按用户填写的 baseUrl', async () => {
    const url = await captureUrl({ type: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: '' });
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
  });
});
