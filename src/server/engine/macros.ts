/**
 * 宏替换器（纯函数）
 * 算法规格见核心算法规格文档 §4
 * 参考：SillyTavern public/scripts/macros.js
 */

export interface MacroContext {
  charName: string;
  userName: string;
  description?: string;
  personality?: string;
  scenario?: string;
  persona?: string;
  wiBefore?: string;
  wiAfter?: string;
  systemPrompt?: string;
  /** 自定义宏 */
  custom?: Record<string, string>;
}

/** 随机数 [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 解析 {{random:A,B,C}} / {{pick:A,B,C}} */
function pickRandom(args: string): string {
  const parts = args.split(',').map((s) => s.trim());
  return parts[Math.floor(Math.random() * parts.length)];
}

/** 解析 {{roll:N}} / {{roll:dN}} */
function roll(args: string): string {
  const a = args.trim();
  if (a.startsWith('d')) {
    const n = parseInt(a.slice(1), 10);
    return String(randInt(1, n || 6));
  }
  return String(randInt(1, parseInt(a, 10) || 6));
}

/**
 * 宏替换主流程
 * - 大小写不敏感（{{CHAR}} 等同 {{char}}）
 * - 嵌套宏先内后外
 * - 未识别宏原样保留
 */
export function substituteParams(text: string, ctx: MacroContext): string {
  const macros: Record<string, string> = {
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

  // 函数型宏（最多 3 轮嵌套展开）
  let out = text;
  for (let round = 0; round < 3; round++) {
    let changed = false;
    out = out.replace(/\{\{([^{}]+)\}\}/g, (full, inner: string) => {
      const key = inner.trim();
      const lower = key.toLowerCase();
      // 函数型宏
      if (lower.startsWith('random:') || lower.startsWith('pick:')) {
        changed = true;
        return pickRandom(key.slice(key.indexOf(':') + 1));
      }
      if (lower.startsWith('roll:')) {
        changed = true;
        return roll(key.slice(key.indexOf(':') + 1));
      }
      if (lower.startsWith('//')) {
        changed = true;
        return '';
      }
      if (lower.startsWith('comment:')) {
        changed = true;
        return '';
      }
      if (lower.startsWith('reverse:')) {
        changed = true;
        return key.slice(key.indexOf(':') + 1).split('').reverse().join('');
      }
      // 变量宏（大小写不敏感）
      const v = macros[lower];
      if (v !== undefined) {
        changed = true;
        return v;
      }
      return full;
    });
    if (!changed) break;
  }
  return out;
}
