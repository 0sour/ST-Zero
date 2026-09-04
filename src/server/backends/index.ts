/**
 * 后端适配器
 * OpenAI 兼容 API（OpenAI/DeepSeek/GLM/Ollama/vLLM/OpenRouter 等）
 * KoboldAI API（KoboldCpp 本地推理）
 */

export interface BackendConfig {
  type: 'openai' | 'ollama' | 'text';
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface GenerateOptions {
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

/** 解析 SSE 流（OpenAI 格式） */
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text ?? '';
          if (delta) yield delta;
        } catch {
          // 跳过无法解析的帧
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** OpenAI 兼容 Chat Completion（流式） */
export async function* generateChatCompletion(
  backend: BackendConfig,
  messages: Array<{ role: string; content: string }>,
  options: GenerateOptions,
): AsyncGenerator<string> {
  // Ollama Cloud 的 OpenAI 兼容端点在 /v1 下（ollama.com/api → ollama.com/v1）
  let base = backend.baseUrl.replace(/\/$/, '');
  if (backend.type === 'ollama' && !/\/v\d+$/.test(base)) {
    base = base.replace(/\/api$/, '') + '/v1';
  }
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: backend.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.9,
      top_p: options.topP ?? 0.95,
      ...(options.topK !== undefined ? { top_k: options.topK } : {}),
      ...(options.frequencyPenalty !== undefined ? { frequency_penalty: options.frequencyPenalty } : {}),
      ...(options.presencePenalty !== undefined ? { presence_penalty: options.presencePenalty } : {}),
      stream: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Backend error ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('No response body');
  yield* parseSse(res.body);
}

/** OpenAI 兼容 Text Completion（流式） */
export async function* generateTextCompletion(
  backend: BackendConfig,
  prompt: string,
  options: GenerateOptions,
): AsyncGenerator<string> {
  const url = `${backend.baseUrl.replace(/\/$/, '')}/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: backend.model,
      prompt,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.9,
      top_p: options.topP ?? 0.95,
      ...(options.topK !== undefined ? { top_k: options.topK } : {}),
      ...(options.frequencyPenalty !== undefined ? { frequency_penalty: options.frequencyPenalty } : {}),
      ...(options.presencePenalty !== undefined ? { presence_penalty: options.presencePenalty } : {}),
      stream: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Backend error ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('No response body');
  yield* parseSse(res.body);
}

/** KoboldAI 生成（流式） */
export async function* generateKobold(
  backend: BackendConfig,
  prompt: string,
  options: GenerateOptions,
): AsyncGenerator<string> {
  const url = `${backend.baseUrl.replace(/\/$/, '')}/v1/generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      max_context_length: 4096,
      max_length: options.maxTokens,
      temperature: options.temperature ?? 0.9,
      top_p: options.topP ?? 0.95,
      top_k: options.topK ?? 40,
      ...(options.frequencyPenalty !== undefined ? { rep_pen: options.frequencyPenalty } : {}),
      stream: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kobold error ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('No response body');
  yield* parseSse(res.body);
}

/** 拉取模型列表（OpenAI 兼容） */
export async function fetchModels(backend: BackendConfig): Promise<string[]> {
  const url = `${backend.baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetch(url, {
    headers: backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => m.id);
}
