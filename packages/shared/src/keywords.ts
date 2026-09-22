/**
 * 批次關鍵字貼上解析。
 *
 * 一行一個關鍵字，第一個分隔符號之後是說明欄。接受的分隔符號：
 * 全形直線 ｜、半形直線 |、Tab、頓號 、
 *
 * 只切第一個分隔符號，後面出現的分隔符號一律留在說明欄裡 —— 說明欄要支援 LaTeX，
 * 而 \left| x \right| 這種寫法本來就含有直線。
 */

export interface ParsedKeyword {
  term: string;
  description: string;
}

/** 允許的分隔符號，依序比對。 */
export const KEYWORD_SEPARATORS = ['｜', '|', '\t', '、'] as const;

function normalize(text: string): string {
  return text.replace(/[　 ]/g, ' ').trim();
}

/** 找出最早出現的分隔符號位置，沒有則回傳 -1。 */
function firstSeparatorIndex(line: string): number {
  let best = -1;
  for (const sep of KEYWORD_SEPARATORS) {
    const idx = line.indexOf(sep);
    if (idx >= 0 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

/**
 * 解析批次貼上的關鍵字。
 *
 * 空行會被略過；只有分隔符號而沒有關鍵字的行也會被略過。
 * 沒有分隔符號的行視為只有關鍵字、說明為空字串。
 */
export function parseKeywords(input: string): ParsedKeyword[] {
  const out: ParsedKeyword[] = [];

  for (const rawLine of input.split(/\r\n|\r|\n/)) {
    const line = normalize(rawLine);
    if (line === '') continue;

    const idx = firstSeparatorIndex(line);
    if (idx < 0) {
      out.push({ term: line, description: '' });
      continue;
    }

    // 四種分隔符號都是單一字元。
    const term = normalize(line.slice(0, idx));
    const description = normalize(line.slice(idx + 1));
    if (term === '') continue;

    out.push({ term, description });
  }

  return out;
}
