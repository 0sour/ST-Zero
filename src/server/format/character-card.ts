/**
 * 角色卡解析与转换
 * 支持 V1（TavernCardV1）/ V2（chara_card_v2）/ V3（chara_card_v3）
 * 规范来源：character-card-spec-v2 / character-card-spec-v3
 * 原则：未知字段必须保留不销毁（MUST NOT destroy）
 */

export interface CharacterCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  [key: string]: unknown;
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    character_book?: unknown;
    tags?: string[];
    creator?: string;
    character_version?: string;
    extensions?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface CharacterCardV3 {
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: CharacterCardV2['data'] & {
    assets?: Array<{ type: string; uri: string; name: string; ext: string }>;
    nickname?: string;
    creator_notes_multilingual?: Record<string, string>;
    source?: string[];
    group_only_greetings?: string[];
    creation_date?: number;
    modification_date?: number;
  };
}

export type CharacterCard = CharacterCardV1 | CharacterCardV2 | CharacterCardV3;

/** 检测卡片版本 */
export function detectSpec(json: unknown): 'v1' | 'v2' | 'v3' | 'unknown' {
  if (typeof json !== 'object' || json === null) return 'unknown';
  const obj = json as Record<string, unknown>;
  if (obj.spec === 'chara_card_v3') return 'v3';
  if (obj.spec === 'chara_card_v2') return 'v2';
  if (typeof obj.name === 'string' && typeof obj.description === 'string') return 'v1';
  return 'unknown';
}

/** V1 → V2 转换（V1 字段提升到 data 下） */
export function v1ToV2(v1: CharacterCardV1): CharacterCardV2 {
  const { name, description, personality, scenario, first_mes, mes_example, ...rest } = v1;
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name,
      description,
      personality,
      scenario,
      first_mes,
      mes_example,
      // 未知字段保留
      ...rest,
    },
  };
}

/** 统一为 V2 格式（内部处理标准） */
export function normalizeToV2(card: unknown): CharacterCardV2 {
  const version = detectSpec(card);
  if (version === 'v2') return card as CharacterCardV2;
  if (version === 'v3') {
    const v3 = card as CharacterCardV3;
    return {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { ...v3.data },
    };
  }
  if (version === 'v1') return v1ToV2(card as CharacterCardV1);
  throw new Error('Unrecognized character card format');
}

/** 导出为 V2（剥离 ST 私有字段 fav/chat） */
export function toExportV2(card: CharacterCardV2): CharacterCardV2 {
  const data = { ...card.data };
  if (data.extensions) {
    const ext = { ...data.extensions };
    delete ext.fav;
    delete ext.chat;
    data.extensions = ext;
  }
  return { ...card, data };
}

/** 提取角色名（V3 有 nickname 时优先） */
export function getCharacterName(card: CharacterCardV2): string {
  return card.data.name || 'Unnamed';
}
