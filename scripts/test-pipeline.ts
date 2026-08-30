import { scanWorldInfo, DEFAULT_WI_SETTINGS } from '../src/server/engine/lorebook.js';
import { buildPrompt } from '../src/server/engine/prompt.js';
import { parseWorldInfo } from '../src/server/format/world-info.js';

// 模拟世界书（雾之馆的世界）
const wi = parseWorldInfo({
  name: '雾之馆的世界',
  entries: {
    '0': { uid: 0, key: ['图书馆', '书架'], content: '放学后的图书馆是千夏的秘密基地，靠窗第三排书架藏着她的推理小说收藏。', order: 100 },
    '1': { uid: 1, key: ['雾之馆'], content: '千夏最近在读的小说，谜底与馆主的双胞胎弟弟有关。', order: 200 },
  },
});

const chat = [
  { name: '樱井千夏', is_user: false, mes: '啊，你来了。今天图书馆没什么人。' },
  { name: '你', is_user: true, mes: '你好，图书馆今天有什么书？' },
];

// 1. 世界书扫描：关键词"图书馆"应激活条目 0
const result = scanWorldInfo({
  entries: Object.values(wi.entries),
  chatMessages: chat,
  settings: DEFAULT_WI_SETTINGS,
  maxContext: 4096,
});
console.log('=== 世界书扫描 ===');
console.log('激活条目数:', result.activatedEntries.length);
console.log('激活关键词:', result.activatedEntries.map((e) => e.key).join(', '));
console.log('worldInfoBefore 包含图书馆内容:', result.worldInfoBefore.includes('秘密基地'));

// 2. prompt 构建：世界书应注入 system 消息
const prompt = buildPrompt({
  character: {
    name: '樱井千夏', description: '温柔的高中图书委员', personality: '温柔细心',
    scenario: '放学后的图书馆', first_mes: '啊，你来了。', mes_example: '',
  },
  chat,
  worldInfo: result,
  persona: '',
  userName: '你',
  instruct: { input_sequence: '<|im_start|>user', output_sequence: '<|im_start|>assistant', system_sequence: '<|im_start|>system', stop_sequence: '<|im_end|>', wrap: true, macro: true, names_behavior: 'force' },
  context: { story_string: '{{system}}\n{{description}}\n{{chatHistory}}', example_separator: '***', chat_start: '***' },
  maxContext: 4096,
  maxTokens: 300,
  regexScripts: [],
  mode: 'chat',
});
console.log('\n=== Prompt 构建 ===');
console.log('消息数:', prompt.messages.length);
console.log('世界书注入:', prompt.messages.some((m) => m.content.includes('秘密基地')));
console.log('角色定义注入:', prompt.messages.some((m) => m.content.includes('温柔的高中图书委员')));
