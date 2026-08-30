/**
 * 启动入口（独立文件，避免 import.meta.url 判断在 tsx 下失效）
 */
import { createApp } from './index.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`ST-Zero server listening on http://localhost:${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(`Accounts mode: ${config.enableAccounts ? 'multi-user' : 'single-user'}`);
});
