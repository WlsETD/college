/**
 * Cubic 11 子集化與 unicode-range 分片。
 *
 * 為什麼要分片：整份 Cubic 11 有 10,268 個字，打包成單一 woff2 約 400 KB。
 * 手機優先的 PWA 不該為了幾十個中文字先下載 400 KB，所以切成多個 woff2，
 * 再用 @font-face 的 unicode-range 讓瀏覽器只抓真正用到的那幾片。
 *
 * 分片策略：
 *   core   非中文的部分（拉丁、數字、標點、箭頭、幾何圖形、全形、注音…）。
 *          每一頁都會用到，一定會下載。
 *   ui     掃描 apps/web/src 找出程式碼裡寫死的中文字。介面文案幾乎都在這片，
 *          所以一般畫面只要 core + ui 兩個請求。
 *   cjk-NN 其餘中文字，依碼位切塊。使用者輸入的內容（科目名稱、章節標題…）
 *          才會用到，用到哪塊抓哪塊。
 *
 * 三片的 unicode-range 互斥，否則同一個碼位會由後宣告的 @font-face 勝出，
 * 導致前面的片白下載。
 *
 * 用法：pnpm --filter @jindu/web fonts
 * 產物：public/fonts/*.woff2 與 src/styles/fonts.css，兩者都要進版控。
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import subsetFont from 'subset-font';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');

// -----------------------------------------------------------------------------
// 來源字型
// -----------------------------------------------------------------------------

/** 俐方體十一號（Cubic 11），SIL OFL 授權，可自由散布與修改。 */
const FONT = {
  version: '1.500',
  url: 'https://raw.githubusercontent.com/ACh-K/Cubic-11/v1.500/fonts/ttf/Cubic_11.ttf',
  sha256: '0193f5f033612496df6b45ee92ac3b335bc6a5a24ff95da55ca87b33e57dcf62',
  licenseUrl: 'https://raw.githubusercontent.com/ACh-K/Cubic-11/v1.500/OFL.txt',
};

const cacheDir = join(webRoot, '.font-cache');
const cachePath = join(cacheDir, `Cubic_11-${FONT.version}.ttf`);

async function loadSourceFont() {
  if (existsSync(cachePath)) {
    const buf = await readFile(cachePath);
    verify(buf);
    return buf;
  }

  console.log(`下載 Cubic 11 v${FONT.version}…`);
  const res = await fetch(FONT.url);
  if (!res.ok) throw new Error(`下載失敗：${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  verify(buf);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, buf);
  return buf;
}

function verify(buf) {
  const digest = createHash('sha256').update(buf).digest('hex');
  if (digest !== FONT.sha256) {
    throw new Error(`字型檔雜湊不符：預期 ${FONT.sha256}，實際 ${digest}`);
  }
}

// -----------------------------------------------------------------------------
// 掃描程式碼裡的中文字
// -----------------------------------------------------------------------------

const SCAN_DIRS = [join(webRoot, 'src')];
const SCAN_FILES = [join(webRoot, 'index.html')];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html']);

async function collectUiText() {
  const files = [...SCAN_FILES];
  for (const dir of SCAN_DIRS) {
    for await (const file of walk(dir)) files.push(file);
  }

  const chars = new Set();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const ch of text) {
      if (isCjk(ch.codePointAt(0))) chars.add(ch);
    }
  }
  return chars;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCAN_EXTENSIONS.has(extname(entry.name))) yield full;
  }
}

function isCjk(cp) {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) || // 擴充 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 統一表意
    (cp >= 0xf900 && cp <= 0xfaff) || // 相容表意
    (cp >= 0x20000 && cp <= 0x3ffff) // 擴充 B 以後
  );
}

// -----------------------------------------------------------------------------
// 分片
// -----------------------------------------------------------------------------

/** 每個 cjk 分片大約放幾個字。 */
const CJK_CHUNK = 800;

function buildShards(allCodePoints, uiChars) {
  const nonCjk = [];
  const cjk = [];
  for (const cp of allCodePoints) {
    (isCjk(cp) ? cjk : nonCjk).push(cp);
  }

  const ui = [...uiChars]
    .map((ch) => ch.codePointAt(0))
    .filter((cp) => allCodePoints.has(cp))
    .sort((a, b) => a - b);
  const uiSet = new Set(ui);

  const rest = cjk.filter((cp) => !uiSet.has(cp));

  const shards = [
    { name: 'core', codePoints: nonCjk },
    { name: 'ui', codePoints: ui },
  ];

  for (let i = 0; i < rest.length; i += CJK_CHUNK) {
    const index = String(shards.length - 1).padStart(2, '0');
    shards.push({ name: `cjk-${index}`, codePoints: rest.slice(i, i + CJK_CHUNK) });
  }

  return shards.filter((shard) => shard.codePoints.length > 0);
}

/** 把排序過的碼位壓成 unicode-range 字串。 */
function toUnicodeRange(codePoints) {
  const parts = [];
  let start = codePoints[0];
  let prev = start;

  for (let i = 1; i <= codePoints.length; i += 1) {
    const cp = codePoints[i];
    if (cp === prev + 1) {
      prev = cp;
      continue;
    }
    parts.push(start === prev ? hex(start) : `${hex(start)}-${hex(prev).slice(2)}`);
    start = cp;
    prev = cp;
  }

  return parts.join(',');
}

function hex(cp) {
  return `U+${cp.toString(16).toUpperCase()}`;
}

// -----------------------------------------------------------------------------
// 主流程
// -----------------------------------------------------------------------------

async function main() {
  const source = await loadSourceFont();

  const allCodePoints = readCmapCodePoints(source);

  const uiChars = await collectUiText();
  const shards = buildShards(allCodePoints, uiChars);

  const outDir = join(webRoot, 'public', 'fonts');
  await mkdir(outDir, { recursive: true });

  const faces = [];
  let total = 0;

  for (const shard of shards) {
    const text = shard.codePoints.map((cp) => String.fromCodePoint(cp)).join('');
    const buf = await subsetFont(source, text, {
      targetFormat: 'woff2',
      // 0 版權、7 商標、13 授權、14 授權網址：讓 OFL 聲明跟著子集走。
      preserveNameIds: [0, 7, 13, 14],
    });

    const file = `cubic11-${shard.name}.woff2`;
    await writeFile(join(outDir, file), buf);
    total += buf.length;

    faces.push({
      file,
      range: toUnicodeRange(shard.codePoints),
      count: shard.codePoints.length,
      bytes: buf.length,
    });

    console.log(
      `  ${file.padEnd(24)} ${String(shard.codePoints.length).padStart(5)} 字  ${kb(buf.length)}`,
    );
  }

  await writeLicense(outDir);
  await writeFile(join(webRoot, 'src', 'styles', 'fonts.css'), renderCss(faces), 'utf8');

  console.log(`\n共 ${faces.length} 片，合計 ${kb(total)}`);
  console.log(`一般畫面只會下載 core + ui：${kb(faces[0].bytes + (faces[1]?.bytes ?? 0))}`);
}

/** 讀 cmap 取得字型涵蓋的所有碼位。只處理 format 4 與 12，Cubic 11 兩種都有。 */
function readCmapCodePoints(source) {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const numTables = view.getUint16(4);
  let cmapOffset = 0;
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(rec),
      view.getUint8(rec + 1),
      view.getUint8(rec + 2),
      view.getUint8(rec + 3),
    );
    if (tag === 'cmap') cmapOffset = view.getUint32(rec + 8);
  }
  if (!cmapOffset) throw new Error('找不到 cmap 表');

  const numSub = view.getUint16(cmapOffset + 2);
  const result = new Set();
  for (let i = 0; i < numSub; i += 1) {
    const sub = cmapOffset + 4 + i * 8;
    const offset = cmapOffset + view.getUint32(sub + 4);
    const format = view.getUint16(offset);

    if (format === 4) {
      const segCountX2 = view.getUint16(offset + 6);
      const endBase = offset + 14;
      const startBase = endBase + segCountX2 + 2;
      for (let s = 0; s < segCountX2 / 2; s += 1) {
        const end = view.getUint16(endBase + s * 2);
        const start = view.getUint16(startBase + s * 2);
        if (start === 0xffff) continue;
        for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) result.add(cp);
      }
    } else if (format === 12) {
      const nGroups = view.getUint32(offset + 12);
      for (let g = 0; g < nGroups; g += 1) {
        const base = offset + 16 + g * 12;
        const start = view.getUint32(base);
        const end = view.getUint32(base + 4);
        for (let cp = start; cp <= end; cp += 1) result.add(cp);
      }
    }
  }
  return result;
}

/** 散布子集化後的字型要附上 OFL 全文。 */
async function writeLicense(outDir) {
  const target = join(outDir, 'OFL.txt');
  if (existsSync(target)) return;
  const res = await fetch(FONT.licenseUrl);
  if (!res.ok) throw new Error(`下載授權檔失敗：${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
}

function renderCss(faces) {
  const header = `/* =============================================================================
   Cubic 11（俐方體十一號）v${FONT.version}，SIL OFL 授權。
   授權全文見 public/fonts/OFL.txt。

   這個檔案由 scripts/build-fonts.mjs 產生，不要手改。
   要重新產生：pnpm --filter @jindu/web fonts

   點陣格線備忘：一個點是 100 font units，em 是 1200 units，所以 em 裡剛好
   12 個點。font-size 必須是 12 的整數倍（12 / 24 / 36px）才會對齊像素格線，
   其餘尺寸會糊掉。詳見 src/styles/tokens.css。
   ========================================================================== */
`;

  const blocks = faces.map(
    (face) => `
/* ${face.count} 字 · ${kb(face.bytes)} */
@font-face {
  font-family: 'Cubic 11';
  src: url('/fonts/${face.file}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: ${face.range};
}`,
  );

  return `${header}${blocks.join('\n')}\n`;
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

await main();
