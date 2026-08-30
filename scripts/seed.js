/**
 * 测试数据种子脚本
 * 用法：node scripts/seed.js
 * 创建两组完整数据：角色 + 聊天 + 世界书 + 正则 + 设置
 */
const BASE = 'http://localhost:8000';

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`${method} ${path}: ${data.error || res.status}`);
  }
  return res.json();
}

async function main() {
  // 登录
  const { token } = await req('POST', '/api/auth/login', { username: 'default-user', password: 'admin' });
  console.log('✓ 登录成功');

  // ============ 第一组：樱井千夏（日常/校园/推理） ============
  console.log('\n=== 第一组：樱井千夏 ===');
  const char1 = await req('POST', '/api/characters', {
    name: '樱井千夏',
    description: '温柔的高中图书委员，喜欢推理小说。说话轻声细语，偶尔会露出狡黠的笑容。',
    personality: '温柔、细心、有点小腹黑。喜欢安静的环境，对推理小说有独特见解。',
    scenario: '放学后的图书馆，夕阳透过窗户洒在书架上。',
    first_mes: '啊，你来了。今天图书馆没什么人，正好可以安静地看书。要一起坐吗？',
    mes_example: '<START>\n{{user}}: 千夏，今天有什么新书吗？\n{{char}}: 嗯，刚到一本《雾之馆的杀人事件》，听说谜底很精彩。',
  }, token);
  console.log('✓ 角色创建:', char1.id);

  const chat1 = await req('POST', '/api/chats', { character_id: char1.id, title: '放学后的图书馆' }, token);
  console.log('✓ 聊天创建:', chat1.id);

  const world1 = await req('POST', '/api/worlds', { name: '雾之馆的世界' }, token);
  await req('PUT', `/api/worlds/${world1.id}`, {
    name: '雾之馆的世界',
    entries: {
      '0': { uid: 0, key: ['图书馆', '书架', '借书'], content: '放学后的图书馆是千夏的秘密基地，靠窗第三排书架藏着她的推理小说收藏。', order: 100, constant: false },
      '1': { uid: 1, key: ['雾之馆', '杀人事件'], content: '千夏最近在读的小说，谜底与馆主的双胞胎弟弟有关。', order: 200, constant: false },
      '2': { uid: 2, key: ['图书委员'], content: '千夏是图书委员，负责整理新到书籍，因此知道很多同学借书的小秘密。', order: 300, constant: false },
    },
    extensions: {},
  }, token);
  console.log('✓ 世界书创建:', world1.id);

  // ============ 第二组：艾尔文·灰烬（奇幻/冒险） ============
  console.log('\n=== 第二组：艾尔文·灰烬 ===');
  const char2 = await req('POST', '/api/characters', {
    name: '艾尔文·灰烬',
    description: '流亡的骑士团长，背负着王国的秘密。沉默寡言，但重信守诺。',
    personality: '坚毅、忠诚、外冷内热。剑术高超，对背叛者绝不宽容。',
    scenario: '王都陷落后的荒野，篝火旁。',
    first_mes: '剑已出鞘，就没有回头的余地。你确定要与我同行吗？',
    mes_example: '<START>\n{{user}}: 团长，我们接下来去哪？\n{{char}}: 先离开王都的范围，往北方的边境走。',
  }, token);
  console.log('✓ 角色创建:', char2.id);

  const chat2 = await req('POST', '/api/chats', { character_id: char2.id, title: '王都的阴影' }, token);
  console.log('✓ 聊天创建:', chat2.id);

  const world2 = await req('POST', '/api/worlds', { name: '灰烬王国编年史' }, token);
  await req('PUT', `/api/worlds/${world2.id}`, {
    name: '灰烬王国编年史',
    entries: {
      '0': { uid: 0, key: ['王都', '陷落'], content: '三个月前王都陷落，国王被杀，艾尔文带着王室血脉逃出。', order: 100, constant: false },
      '1': { uid: 1, key: ['灰烬骑士团'], content: '艾尔文曾是灰烬骑士团团长，全团三百骑士仅存七人。', order: 200, constant: false },
      '2': { uid: 2, key: ['边境', '北方'], content: '北方的边境要塞是最后的希望，那里还忠于王室。', order: 300, constant: false },
    },
    extensions: {},
  }, token);
  console.log('✓ 世界书创建:', world2.id);

  // 设置：后端连接（Ollama 默认）
  await req('PUT', '/api/settings', {
    backend: { type: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: '' },
    sampling: { temperature: 0.9, topP: 0.95 },
  }, token);
  console.log('✓ 设置已保存');

  console.log('\n=== 完成 ===');
  console.log('测试账号: default-user / admin');
  console.log('角色: 樱井千夏（日常/推理）、艾尔文·灰烬（奇幻/冒险）');
  console.log('世界书: 雾之馆的世界、灰烬王国编年史');
}

main().catch((e) => {
  console.error('种子失败:', e.message);
  process.exit(1);
});
