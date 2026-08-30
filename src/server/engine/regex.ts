/**
 * 正则引擎（纯函数）
 * 算法规格见核心算法规格文档 §3
 * 参考：SillyTavern public/scripts/extensions/regex/engine.js
 */

export interface RegexScript {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  /** 作用位置：1=USER_INPUT, 2=AI_OUTPUT, 3=SLASH_COMMAND, 5=WORLD_INFO, 6=REASONING */
  placement: number[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  /** 0=NONE, 1=RAW, 2=ESCAPED */
  substituteRegex: number;
  minDepth: number | null;
  maxDepth: number | null;
}

export interface RegexInput {
  text: string;
  scripts: RegexScript[];
  placement: number;
  depth: number;
  isMarkdown: boolean;
  isPrompt: boolean;
  isEdit: boolean;
}

export interface RegexResult {
  text: string;
  appliedScripts: string[];
}

/** 宏替换（供正则使用，简化版） */
function substituteMacros(text: string, macros: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(macros)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

/** 转义正则特殊字符 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 正则处理主流程
 * 1. 过滤（disabled/placement/depth/markdownOnly/promptOnly/runOnEdit）
 * 2. 构建正则（substituteRegex 决定宏处理方式）
 * 3. 执行替换（{{match}}/$1/$<name>/trimStrings）
 */
export function applyRegex(input: RegexInput, macros: Record<string, string> = {}): RegexResult {
  let finalString = input.text;
  const applied: string[] = [];

  for (const script of input.scripts) {
    if (script.disabled) continue;
    // 作用位置过滤
    if (!script.placement.includes(input.placement)) continue;
    // markdownOnly / promptOnly 过滤
    if (script.markdownOnly && !input.isMarkdown) continue;
    if (script.promptOnly && !input.isPrompt) continue;
    if (!script.markdownOnly && !script.promptOnly && (input.isMarkdown || input.isPrompt)) continue;
    // 编辑过滤
    if (input.isEdit && !script.runOnEdit) continue;
    // 深度过滤
    if (typeof input.depth === 'number') {
      if (script.minDepth !== null && script.minDepth !== undefined && script.minDepth >= 0 && input.depth < script.minDepth) continue;
      if (script.maxDepth !== null && script.maxDepth !== undefined && script.maxDepth >= 0 && input.depth > script.maxDepth) continue;
    }
    if (!script.findRegex) continue;

    // 构建正则
    let pattern = script.findRegex;
    if (script.substituteRegex === 1) {
      pattern = substituteMacros(pattern, macros);
    } else if (script.substituteRegex === 2) {
      pattern = substituteMacros(pattern, Object.fromEntries(Object.entries(macros).map(([k, v]) => [k, escapeRegex(v)])));
    }
    let re: RegExp;
    try {
      // 支持 /pattern/flags 形式
      if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        const lastSlash = pattern.lastIndexOf('/');
        re = new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1));
      } else {
        re = new RegExp(pattern);
      }
    } catch {
      continue;
    }

    // 执行替换
    finalString = finalString.replace(re, (...args) => {
      const match = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      let replace = script.replaceString.replace(/{{match}}/gi, match);
      replace = replace.replace(/\$(\d+)|\$<([^>]+)>/g, (_, num, name) => {
        if (num) return groups[Number(num) - 1] ?? '';
        if (name) {
          const named = args[args.length - 2] as Record<string, string>;
          return named?.[name] ?? '';
        }
        return '';
      });
      // trimStrings
      for (const trim of script.trimStrings) {
        replace = replace.replaceAll(trim, '');
      }
      return substituteMacros(replace, macros);
    });
    applied.push(script.scriptName);
  }

  return { text: finalString, appliedScripts: applied };
}
