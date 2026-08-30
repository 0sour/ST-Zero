/**
 * 环境配置
 * 优先级：环境变量 > 默认值
 */
export const config = {
  /** 服务端口 */
  port: Number(process.env.PORT || 8000),
  /** 数据根目录 */
  dataDir: process.env.DATA_DIR || './data',
  /** 多用户模式开关（false = 单用户，内置默认管理员） */
  enableAccounts: process.env.ENABLE_ACCOUNTS === 'true',
  /** 开放注册 */
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  /** 新用户默认角色 */
  defaultUserRole: process.env.DEFAULT_USER_ROLE || 'user',
  /** JWT 签名密钥 */
  jwtSecret: process.env.JWT_SECRET || 'st-zero-dev-secret-change-me',
  /** JWT 过期时间 */
  jwtExpiry: process.env.JWT_EXPIRY || '15m',
  /** 登录限流：次数/分钟/IP */
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 5),
  /** 默认用户 handle（单用户模式） */
  defaultUserHandle: 'default-user',
} as const;

export type Config = typeof config;
