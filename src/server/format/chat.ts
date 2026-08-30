/**
 * 聊天记录 JSONL 读写
 * 格式：首行 header（chat_metadata），之后每行一条消息
 * 兼容 SillyTavern：chats/{角色名}/{聊天名}.jsonl
 */

export interface ChatHeader {
  chat_metadata: Record<string, unknown>;
  user_name: string;
  character_name: string;
}

export interface ChatMessage {
  name?: string;
  mes?: string;
  title?: string;
  gen_started?: number;
  gen_finished?: number;
  send_date?: number;
  is_user?: boolean;
  is_system?: boolean;
  force_avatar?: string;
  original_avatar?: string;
  swipes?: string[];
  swipe_info?: Array<Record<string, unknown>>;
  swipe_id?: number;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export function createHeader(metadata: Record<string, unknown> = {}): ChatHeader {
  return {
    chat_metadata: metadata,
    user_name: 'unused',
    character_name: 'unused',
  };
}

/** 解析 JSONL 文本 → header + 消息数组 */
export function parseChatJsonl(text: string): { header: ChatHeader; messages: ChatMessage[] } {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    return { header: createHeader(), messages: [] };
  }
  let header: ChatHeader = createHeader();
  const messages: ChatMessage[] = [];
  lines.forEach((line, i) => {
    try {
      const obj = JSON.parse(line);
      if (i === 0 && (obj.chat_metadata || obj.user_name || obj.character_name)) {
        header = obj as ChatHeader;
      } else {
        messages.push(obj as ChatMessage);
      }
    } catch {
      // 跳过损坏行（fail-loud 原则：记录但不中断）
      console.warn(`[chat] Skipping malformed line ${i + 1}`);
    }
  });
  return { header, messages };
}

/** 序列化为 JSONL 文本 */
export function serializeChatJsonl(header: ChatHeader, messages: ChatMessage[]): string {
  const lines = [JSON.stringify(header), ...messages.map((m) => JSON.stringify(m))];
  return lines.join('\n') + '\n';
}

/** 校验一行是否为有效消息（ST 规则：含 name/character_name/chat_metadata 即有效） */
export function isValidMessageLine(line: string): boolean {
  return line.includes('"name"') || line.includes('"character_name"') || line.includes('"chat_metadata"');
}
