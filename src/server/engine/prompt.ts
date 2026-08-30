/**
 * Prompt 组装器（纯函数）
 * 算法规格见核心算法规格文档 §5
 * 支持 Chat Completion（消息数组）与 Text Completion（单字符串 + Instruct 模板）
 */

import { ChatMessage } from '../format/chat.js';
import { WorldInfoScanResult } from './lorebook.js';
import { substituteParams, MacroContext } from './macros.js';
import { applyRegex, RegexScript } from './regex.js';
import { allocateBudget, estimateTokens } from './token-budget.js';

export interface CharacterPromptData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
}

export interface InstructTemplate {
  input_sequence: string;
  output_sequence: string;
  system_sequence: string;
  stop_sequence: string;
  wrap: boolean;
  macro: boolean;
  names_behavior: 'force' | 'auto' | 'none';
  story_string_prefix?: string;
  story_string_suffix?: string;
}

export interface ContextTemplate {
  story_string: string;
  example_separator: string;
  chat_start: string;
}

export interface PromptBuildInput {
  character: CharacterPromptData;
  chat: ChatMessage[];
  worldInfo: WorldInfoScanResult;
  persona: string;
  userName: string;
  instruct: InstructTemplate;
  context: ContextTemplate;
  maxContext: number;
  maxTokens: number;
  regexScripts: RegexScript[];
  mode: 'chat' | 'text';
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PromptBuildResult {
  messages: ChatCompletionMessage[];
  prompt: string;
  tokenCount: number;
  budget: { used: number; total: number };
}

function buildMacroContext(input: PromptBuildInput): MacroContext {
  return {
    charName: input.character.name,
    userName: input.userName,
    description: input.character.description,
    personality: input.character.personality,
    scenario: input.character.scenario,
    persona: input.persona,
    wiBefore: input.worldInfo.worldInfoBefore,
    wiAfter: input.worldInfo.worldInfoAfter,
    systemPrompt: input.character.system_prompt,
  };
}

/** 扁平化宏上下文（供正则引擎使用） */
function flattenMacros(ctx: MacroContext): Record<string, string> {
  return {
    char: ctx.charName,
    user: ctx.userName,
    description: ctx.description ?? '',
    personality: ctx.personality ?? '',
    scenario: ctx.scenario ?? '',
    persona: ctx.persona ?? '',
    wiBefore: ctx.wiBefore ?? '',
    wiAfter: ctx.wiAfter ?? '',
    system: ctx.systemPrompt ?? '',
    ...ctx.custom,
  };
}

/** 组装 Chat Completion 消息数组 */
function buildChatMessages(input: PromptBuildInput): ChatCompletionMessage[] {
  const macros = buildMacroContext(input);
  const messages: ChatCompletionMessage[] = [];

  // 系统提示词（角色 system_prompt 或默认）
  const systemPrompt = input.character.system_prompt
    ? substituteParams(input.character.system_prompt, macros)
    : `Write ${input.character.name}'s next reply in a fictional chat between ${input.userName} and ${input.character.name}.`;
  messages.push({ role: 'system', content: systemPrompt });

  // 角色定义
  const defParts: string[] = [];
  if (input.character.description) defParts.push(`Description: ${substituteParams(input.character.description, macros)}`);
  if (input.character.personality) defParts.push(`Personality: ${substituteParams(input.character.personality, macros)}`);
  if (input.character.scenario) defParts.push(`Scenario: ${substituteParams(input.character.scenario, macros)}`);
  if (input.worldInfo.worldInfoBefore) defParts.push(input.worldInfo.worldInfoBefore.trim());
  if (input.worldInfo.worldInfoAfter) defParts.push(input.worldInfo.worldInfoAfter.trim());
  if (defParts.length) {
    messages.push({ role: 'system', content: defParts.join('\n') });
  }

  // 示例对话
  if (input.character.mes_example) {
    const example = substituteParams(input.character.mes_example, macros);
    messages.push({ role: 'system', content: `Example of previous conversation:\n${example}` });
  }

  // 聊天历史
  for (const m of input.chat) {
    if (m.is_system) continue;
    const role: 'user' | 'assistant' = m.is_user ? 'user' : 'assistant';
    const name = m.name || (m.is_user ? input.userName : input.character.name);
    const content = substituteParams(m.mes ?? '', macros);
    messages.push({ role, content: `${name}: ${content}` });
  }

  // 后置指令
  if (input.character.post_history_instructions) {
    messages.push({
      role: 'system',
      content: substituteParams(input.character.post_history_instructions, macros),
    });
  }

  // 正则处理（promptOnly 脚本，AI_OUTPUT 位置）
  const processed = messages.map((m) => {
    const r = applyRegex(
      { text: m.content, scripts: input.regexScripts, placement: 2, depth: 0, isMarkdown: false, isPrompt: true, isEdit: false },
      flattenMacros(macros),
    );
    return { ...m, content: r.text };
  });

  // 预算裁剪
  const blocks = processed.map((m, i) => ({
    id: `msg-${i}`,
    content: m.content,
    fixed: i < 3, // 系统提示词与角色定义固定
    priority: i,
  }));
  const budget = allocateBudget(blocks, input.maxContext - input.maxTokens);
  const keptIds = new Set(budget.blocks.map((b) => b.id));
  const finalMessages = processed.filter((_, i) => keptIds.has(`msg-${i}`));

  return finalMessages;
}

/** 组装 Text Completion 单字符串 */
function buildTextPrompt(input: PromptBuildInput): string {
  const macros = buildMacroContext(input);
  const { story_string } = input.context;

  // 聊天历史（instruct 包装）
  const history = input.chat
    .filter((m) => !m.is_system)
    .map((m) => {
      const name = m.name || (m.is_user ? input.userName : input.character.name);
      const seq = m.is_user ? input.instruct.input_sequence : input.instruct.output_sequence;
      const content = substituteParams(m.mes ?? '', macros);
      return `${seq}${name}: ${content}${input.instruct.stop_sequence}`;
    })
    .join('\n');

  // story_string 模板填充
  let prompt = story_string
    .replaceAll('{{system}}', input.character.system_prompt ?? '')
    .replaceAll('{{description}}', substituteParams(input.character.description, macros))
    .replaceAll('{{personality}}', substituteParams(input.character.personality, macros))
    .replaceAll('{{scenario}}', substituteParams(input.character.scenario, macros))
    .replaceAll('{{wiBefore}}', input.worldInfo.worldInfoBefore.trim())
    .replaceAll('{{wiAfter}}', input.worldInfo.worldInfoAfter.trim())
    .replaceAll('{{persona}}', input.persona)
    .replaceAll('{{trim}}', '')
    .replaceAll('{{chatHistory}}', history);

  // 正则处理
  const r = applyRegex(
    { text: prompt, scripts: input.regexScripts, placement: 2, depth: 0, isMarkdown: false, isPrompt: true, isEdit: false },
    flattenMacros(macros),
  );
  return r.text;
}

/** Prompt 组装主入口 */
export function buildPrompt(input: PromptBuildInput): PromptBuildResult {
  if (input.mode === 'chat') {
    const messages = buildChatMessages(input);
    const tokenCount = messages.reduce((s, m) => s + estimateTokens(m.content), 0);
    return {
      messages,
      prompt: '',
      tokenCount,
      budget: { used: tokenCount, total: input.maxContext },
    };
  }
  const prompt = buildTextPrompt(input);
  return {
    messages: [],
    prompt,
    tokenCount: estimateTokens(prompt),
    budget: { used: estimateTokens(prompt), total: input.maxContext },
  };
}
