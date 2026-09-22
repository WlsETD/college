/**
 * 目錄文字解析。
 *
 * 輸入使用者貼上的課本目錄或教學大綱，輸出兩層的章／小節結構。
 * 章節樹固定兩層（決策：2026-09-22）。若目錄出現 1.1.1 這類三層以上的編號，
 * 會被保留成小節編號 "1-1-1" 掛在第 1 章底下，而不是再長一層。
 */

/** 解析出來的單一節點。 */
export interface OutlineNode {
  /** 正規化後的編號，章為 "1"、小節為 "1-1"；沒有編號則為 null。 */
  number: string | null;
  /** 去掉編號後的名稱，可能為空字串。 */
  title: string;
  /** 正規化後的原始文字，供 UI 原樣顯示。 */
  raw: string;
}

/** 章。 */
export interface OutlineChapter extends OutlineNode {
  sections: OutlineNode[];
  /** 沒有出現章標題、僅由小節編號推出來的章。 */
  implicit: boolean;
}

export interface ParsedOutline {
  chapters: OutlineChapter[];
  /** 章 + 小節的總數，供 UI 顯示「建立 N 個節點」。 */
  nodeCount: number;
}

const ZH_DIGITS: Record<string, number> = {
  '〇': 0, '零': 0, '○': 0,
  '一': 1, '壹': 1,
  '二': 2, '兩': 2, '貳': 2,
  '三': 3, '參': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陸': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9,
};

const ZH_NUM_CHARS = '〇零○一二三四五六七八九十百壹貳參肆伍陸柒捌玖兩';

/** 中文數字轉阿拉伯數字，支援到「百」。無法解析時回傳 null。 */
export function zhNumberToInt(input: string): number | null {
  const s = input.trim();
  if (s === '') return null;
  if (/^\d+$/.test(s)) return Number(s);

  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const ch of s) {
    if (ch in ZH_DIGITS) {
      current = ZH_DIGITS[ch] as number;
      sawAny = true;
    } else if (ch === '十') {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
      sawAny = true;
    } else if (ch === '百') {
      total += (current === 0 ? 1 : current) * 100;
      current = 0;
      sawAny = true;
    } else {
      return null;
    }
  }
  return sawAny ? total + current : null;
}

/** 全形空白、Tab、不斷行空白一律視為空白，並壓成單一空白。 */
function normalizeSpace(line: string): string {
  return line
    .replace(/[　 \t]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** 去掉目錄常見的點線導引與頁碼，例如「第一章 極限 ......... 12」。 */
function stripPageNumber(line: string): string {
  return line.replace(/[\s.．·…‥_\-–—]{2,}\d{1,4}$/u, '').trim();
}

/** 去掉行首的項目符號。 */
function stripBullet(line: string): string {
  return line.replace(/^[•·▪▸►*◆○●]\s*/u, '').trim();
}

/** 只剩分隔符號或空白的行。 */
function isNoiseLine(line: string): boolean {
  return line === '' || /^[\s.．·…‥_\-–—=＝*]+$/u.test(line);
}

const CHAPTER_ZH_RE = new RegExp(
  `^第\\s*([0-9]+|[${ZH_NUM_CHARS}]+)\\s*[章篇部]\\s*[:：.、．\\-–—]?\\s*(.*)$`,
  'u',
);
const CHAPTER_EN_RE = /^(?:chapter|chap\.?|ch\.?|unit|lesson)\s*([0-9]+)\s*[:.、．\-–—]?\s*(.*)$/iu;
const CHAPTER_PLAIN_RE = /^([0-9]+)\s*[.、．:：)）]\s*(.+)$/u;

const SECTION_NUM_RE = /^(\d+(?:\s*[-–—._．·]\s*\d+)+)\s*[.、．:：)）]?\s*(.*)$/u;
const SECTION_SIGN_RE = /^§\s*(\d+(?:\s*[-–—._．·]\s*\d+)*)\s*[.、．:：)）]?\s*(.*)$/u;
const SECTION_ZH_RE = new RegExp(
  `^第\\s*([0-9]+|[${ZH_NUM_CHARS}]+)\\s*節\\s*[:：.、．\\-–—]?\\s*(.*)$`,
  'u',
);

/** 把 "1 . 2" / "1.2" / "1·2" 這類編號正規化成 "1-2"。 */
function normalizeSectionNumber(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/[._．·–—]/g, '-');
}

interface ChapterHit {
  kind: 'chapter';
  number: string | null;
  title: string;
}
interface SectionHit {
  kind: 'section';
  number: string | null;
  /** 從編號推出來的所屬章編號，沒有則為 null。 */
  chapterNumber: string | null;
  title: string;
}

function classify(line: string, indented: boolean, hasOpenChapter: boolean):
  | ChapterHit
  | SectionHit
  | null {
  // 小節必須先判斷：否則 "1.1 導數" 會被章的 "1." 規則吃掉。
  const sectionNum = SECTION_NUM_RE.exec(line);
  if (sectionNum) {
    const number = normalizeSectionNumber(sectionNum[1] as string);
    return {
      kind: 'section',
      number,
      chapterNumber: number.split('-')[0] ?? null,
      title: (sectionNum[2] ?? '').trim(),
    };
  }

  const sectionSign = SECTION_SIGN_RE.exec(line);
  if (sectionSign) {
    const number = normalizeSectionNumber(sectionSign[1] as string);
    return {
      kind: 'section',
      number,
      chapterNumber: number.includes('-') ? (number.split('-')[0] as string) : null,
      title: (sectionSign[2] ?? '').trim(),
    };
  }

  const sectionZh = SECTION_ZH_RE.exec(line);
  if (sectionZh) {
    const n = zhNumberToInt(sectionZh[1] as string);
    return {
      kind: 'section',
      number: n === null ? null : String(n),
      chapterNumber: null,
      title: (sectionZh[2] ?? '').trim(),
    };
  }

  const chapterZh = CHAPTER_ZH_RE.exec(line);
  if (chapterZh) {
    const n = zhNumberToInt(chapterZh[1] as string);
    return { kind: 'chapter', number: n === null ? null : String(n), title: (chapterZh[2] ?? '').trim() };
  }

  const chapterEn = CHAPTER_EN_RE.exec(line);
  if (chapterEn) {
    return { kind: 'chapter', number: String(Number(chapterEn[1])), title: (chapterEn[2] ?? '').trim() };
  }

  const chapterPlain = CHAPTER_PLAIN_RE.exec(line);
  if (chapterPlain) {
    return { kind: 'chapter', number: String(Number(chapterPlain[1])), title: (chapterPlain[2] ?? '').trim() };
  }

  // 沒有編號：靠縮排判斷。有縮排且已經有章開著就當小節，否則當章。
  if (indented && hasOpenChapter) {
    return { kind: 'section', number: null, chapterNumber: null, title: line };
  }
  return { kind: 'chapter', number: null, title: line };
}

/**
 * 解析貼上的目錄文字。
 *
 * 處理：「第一章」「第1章」「第 一 章」「Chapter 1」「1-1」「1.1」「§1.1」「第一節」、
 * 目錄點線與頁碼、項目符號、空行、全形空白與多餘空白、以及靠縮排判斷的無編號行。
 */
export function parseOutline(input: string): ParsedOutline {
  const chapters: OutlineChapter[] = [];
  let currentIndex = -1;

  for (const rawLine of input.split(/\r\n|\r|\n/)) {
    const indented = /^[\s　]/u.test(rawLine);
    const line = stripBullet(stripPageNumber(normalizeSpace(rawLine)));
    if (isNoiseLine(line)) continue;

    const hit = classify(line, indented, currentIndex >= 0);
    if (!hit) continue;

    if (hit.kind === 'chapter') {
      // 先前若有同編號的隱含章，補上標題而不是再開一章。
      const existing =
        hit.number === null
          ? -1
          : chapters.findIndex((c) => c.implicit && c.number === hit.number);
      if (existing >= 0) {
        const target = chapters[existing] as OutlineChapter;
        target.title = hit.title;
        target.raw = line;
        target.implicit = false;
        currentIndex = existing;
        continue;
      }
      chapters.push({
        number: hit.number,
        title: hit.title,
        raw: line,
        sections: [],
        implicit: false,
      });
      currentIndex = chapters.length - 1;
      continue;
    }

    const node: OutlineNode = { number: hit.number, title: hit.title, raw: line };

    // 依編號找所屬的章；找不到就掛在目前這一章；再沒有就補一個隱含章。
    let targetIndex = -1;
    if (hit.chapterNumber !== null) {
      if (currentIndex >= 0 && chapters[currentIndex]?.number === hit.chapterNumber) {
        targetIndex = currentIndex;
      } else {
        targetIndex = chapters.findIndex((c) => c.number === hit.chapterNumber);
      }
    } else if (currentIndex >= 0) {
      targetIndex = currentIndex;
    }

    if (targetIndex < 0) {
      chapters.push({
        number: hit.chapterNumber,
        title: '',
        raw: '',
        sections: [],
        implicit: true,
      });
      targetIndex = chapters.length - 1;
      currentIndex = targetIndex;
    }

    (chapters[targetIndex] as OutlineChapter).sections.push(node);
  }

  const nodeCount = chapters.reduce((sum, c) => sum + 1 + c.sections.length, 0);
  return { chapters, nodeCount };
}
