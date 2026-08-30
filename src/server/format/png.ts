/**
 * PNG tEXt chunk 读写
 * 角色卡 V2 规范：JSON base64 存入 keyword 为 'chara' 的 tEXt chunk
 * 角色卡 V3 规范：keyword 为 'ccv3'（优先于 'chara'）
 * 参考：SillyTavern src/character-card-parser.js、ChungusHub src/lib/services/pngText.ts
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32（PNG chunk 校验） */
export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface TextChunk {
  keyword: string;
  value: string;
}

/** 解析 PNG 字节，提取全部 tEXt chunk */
export function readTextChunks(png: Buffer): TextChunk[] {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG file');
  }
  const chunks: TextChunk[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        chunks.push({
          keyword: data.subarray(0, nul).toString('latin1'),
          value: data.subarray(nul + 1).toString('latin1'),
        });
      }
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

/** 读取角色卡 JSON（优先 ccv3，其次 chara） */
export function readCharacterCardJson(png: Buffer): { spec: string; json: unknown } | null {
  const chunks = readTextChunks(png);
  const ccv3 = chunks.find((c) => c.keyword === 'ccv3');
  const chara = chunks.find((c) => c.keyword === 'chara');
  const target = ccv3 ?? chara;
  if (!target) return null;
  try {
    const json = JSON.parse(Buffer.from(target.value, 'base64').toString('utf-8'));
    return { spec: ccv3 ? 'chara_card_v3' : 'chara_card_v2', json };
  } catch {
    return null;
  }
}

/** 写入角色卡 JSON 到 PNG（替换已有 chara/ccv3 chunk，插入 IEND 前） */
export function writeCharacterCardJson(png: Buffer, json: unknown, keyword: 'chara' | 'ccv3' = 'chara'): Buffer {
  const value = Buffer.from(JSON.stringify(json)).toString('base64');
  const textData = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(value, 'latin1'),
  ]);
  const chunk = Buffer.alloc(12 + textData.length);
  chunk.writeUInt32BE(textData.length, 0);
  chunk.write('tEXt', 4, 'ascii');
  textData.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + textData.length)), 8 + textData.length);

  // 移除已有 chara/ccv3 chunk
  const out: Buffer[] = [png.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const data = png.subarray(offset + 8, offset + 8 + length);
      const nul = data.indexOf(0);
      const kw = nul > 0 ? data.subarray(0, nul).toString('latin1') : '';
      if (kw === 'chara' || kw === 'ccv3') {
        offset += 12 + length;
        continue;
      }
    }
    out.push(png.subarray(offset, offset + 12 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  // 在 IEND 前插入新 chunk
  const iend = out.pop()!;
  out.push(chunk, iend);
  return Buffer.concat(out);
}
