/**
 * Token 预算管理器（纯函数）
 * 算法规格见核心算法规格文档 §6
 * 参考：SillyTavern public/scripts/openai.js ChatCompletion 类
 */

export interface PromptBlock {
  id: string;
  content: string;
  /** 固定块（不裁剪） */
  fixed: boolean;
  /** 裁剪优先级（越小越先被裁） */
  priority: number;
}

export interface BudgetResult {
  blocks: PromptBlock[];
  totalTokens: number;
  used: number;
  limit: number;
}

/** 估算 token 数（字节/3.35，ST 同款兜底） */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf-8') / 3.35);
}

/**
 * 预算分配
 * 1. 固定块全部保留
 * 2. 弹性块按 priority 从低到高裁剪
 * 3. 聊天历史从最旧开始丢弃
 */
export function allocateBudget(blocks: PromptBlock[], maxContext: number): BudgetResult {
  const fixed = blocks.filter((b) => b.fixed);
  const flexible = blocks
    .filter((b) => !b.fixed)
    .sort((a, b) => a.priority - b.priority);

  const fixedTokens = fixed.reduce((s, b) => s + estimateTokens(b.content), 0);
  let remaining = maxContext - fixedTokens;
  const kept: PromptBlock[] = [...fixed];

  for (const block of flexible) {
    const t = estimateTokens(block.content);
    if (t <= remaining) {
      kept.push(block);
      remaining -= t;
    } else if (block.id === 'chatHistory') {
      // 聊天历史：从最旧消息开始裁剪
      const lines = block.content.split('\n');
      const keptLines: string[] = [];
      let used = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const lineTokens = estimateTokens(lines[i]);
        if (used + lineTokens <= remaining) {
          keptLines.unshift(lines[i]);
          used += lineTokens;
        } else {
          break;
        }
      }
      if (keptLines.length) {
        kept.push({ ...block, content: keptLines.join('\n') });
        remaining -= used;
      }
    }
    // 其他块超预算则丢弃
  }

  const totalTokens = kept.reduce((s, b) => s + estimateTokens(b.content), 0);
  return {
    blocks: kept,
    totalTokens,
    used: totalTokens,
    limit: maxContext,
  };
}
