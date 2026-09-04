<p align="center">
  <strong>ST-Zero</strong><br>
  <em>从零开始的 AI 角色扮演 Web 应用 · SillyTavern 生态兼容</em>
</p>

<p align="center">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-26-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-内置-4F7DB3?logo=sqlite&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-29-blue?logo=docker&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/Tests-77%20passed-green">
</p>

---

**ST-Zero** 是一个从零开始构建的 AI 角色扮演 Web 应用（"类酒馆"项目），目标是在解决 SillyTavern 三大痛点的同时，**完全兼容其生态资源**（角色卡、世界书、正则、预设等可分享资源直接可用）。

## 解决的问题

| SillyTavern 痛点 | ST-Zero 方案 |
|---|---|
| UI 落后（jQuery + 臃肿交互） | 全自研极简版 UI（幽灵按钮 + 极简线条 + 唯一一抹暗红），亮暗双主题 |
| 运行臃肿（前端 11.5MB JS） | 纯 HTML/CSS/JS，无框架依赖，前端轻量 |
| 计算全在前端（浏览器卡顿） | **计算全部后移服务端**：世界书扫描、正则处理、prompt 构建、宏替换、token 预算管理都在服务端执行 |

## 特性

- **角色卡**：导入/导出 PNG / JSON / YAML（自动识别 V1 / V2 / V3），支持标签、备选问候语、嵌入世界书
- **聊天**：SSE 流式输出、swipe 备选回复（真实多备选生成）、消息编辑/删除/重新生成、Markdown 渲染、停止生成
- **世界书**：关键词扫描 + 递归 + token 预算、条目编辑（role/position/常驻）、启用/禁用开关、激活预览
- **正则**：全局 + 角色卡 scoped、placement/深度字段、导入导出
- **预设**：采样参数（Temp/TopP/TopK/MaxTokens/惩罚）+ 指令模板 + 上下文模板，SillyTavern 格式 JSON 导入
- **多后端**：OpenAI 兼容 / Ollama Cloud / KoboldAI / 文本补全
- **多用户**：管理面板（用户 CRUD/角色/启用禁用/编辑用户/站点设置），数据完全隔离
- **快捷回复 / 群聊 / Persona / 聊天设置**（场景覆盖/作者注/聊天级世界书）
- **移动端**：响应式 + 左右滑出抽屉

## 快速开始

### Docker 部署（推荐）

```bash
git clone https://github.com/0sour/ST-Zero.git
cd ST-Zero
docker compose up -d
```

访问 `http://localhost:8000`，默认账号 `default-user` / `admin`（单用户模式）。

> 多用户模式：修改 `docker-compose.yml` 中 `ENABLE_ACCOUNTS=true`（首个注册用户自动成为管理员）。

### 本地开发

```bash
# 需要 Node.js ≥ 20（推荐 26）
npm install
npm run dev        # 开发模式（tsx watch）
npm test           # 运行测试（77 个）
npm run build      # 编译
npm start          # 运行编译产物
```

## 配置 AI 后端

登录后点击顶栏 ⚙️ 设置 → 后端连接：

| 字段 | 说明 | 示例 |
|---|---|---|
| 后端类型 | openai / ollama / kobold / text | ollama |
| API 地址 | 后端服务地址 | `http://localhost:11434/v1`（本地 Ollama）<br>`https://ollama.com/api`（Ollama Cloud）|
| 模型 | 模型 ID | `qwen2.5` / `deepseek-v4-flash:0731` |
| API Key | 可选 | sk-... |

> Ollama Cloud 填根地址会自动补 `/v1`（`https://ollama.com/api` → `https://ollama.com/v1`）。

## 生态兼容

| 资源 | 兼容性 |
|---|---|
| 角色卡 PNG/JSON（V1/V2/V3） | ✅ 直接导入 |
| 世界书 JSON（对象/数组格式） | ✅ 直接导入 |
| 正则 JSON | ✅ 直接导入 |
| 预设（instruct 模板） | ✅ 导入自动转换 |
| 聊天记录（JSONL） | ✅ 导入/导出 |
| STscript / QuickReply 脚本 | ⏳ P2 规划 |

已用 SillyTavern 官方默认素材（Seraphina 角色卡、Eldoria 世界书、ChatML 等预设）完成端到端导入与对话验证。

## 项目结构

```
ST-Zero/
├── public-new/            # 前端（极简版）
│   ├── index.html         # 主界面
│   ├── css/style.css      # 样式（亮暗双主题）
│   └── js/app.js          # 应用逻辑
├── src/server/            # 后端
│   ├── index.ts           # 应用入口
│   ├── start.ts           # 启动入口
│   ├── config.ts          # 环境配置
│   ├── db.ts              # SQLite（node:sqlite）
│   ├── auth/              # 认证（JWT/bcrypt/中间件）
│   ├── format/            # 格式兼容层（PNG/角色卡/世界书/聊天）
│   ├── engine/            # 计算引擎（世界书/正则/宏/prompt/预算）
│   ├── api/               # API 路由
│   └── backends/          # 后端适配器（OpenAI/Ollama/Kobold）
├── tests/                 # Vitest 测试（77 个）
├── doc/                   # 设计文档（PRD/架构/调研/开发日志等）
├── Dockerfile             # 多阶段构建
└── docker-compose.yml     # 一键部署
```

## 技术栈

- **后端**：Node.js 26 + Express + TypeScript + `node:sqlite`（内置模块） + JWT + bcrypt
- **前端**：纯 HTML/CSS/JS（无框架），Lucide 风格内联 SVG 图标
- **测试**：Vitest 4（77 个测试）
- **部署**：Docker 多阶段构建 + Docker Compose，数据卷持久化

## 文档

- [PRD](doc/PRD.md) — 需求与实现状态
- [系统架构设计](doc/系统架构设计.md) — 架构与算法规格
- [部署指南](doc/部署指南.md) — 部署细节
- [开发日志](doc/开发日志.md) — 开发历程与问题修复记录
- [调研报告](doc/调研报告.md) — SillyTavern 生态调研
- [UI 设计规范](doc/UI极简版设计提示词.md) — 极简版设计语言

## License

MIT
