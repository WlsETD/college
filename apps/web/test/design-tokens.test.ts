/**
 * 守住步驟 5 的三條硬規則，避免之後改樣式時悄悄破壞：
 *   1. 像素字級必須是 12 的整數倍（Cubic 11 的 em 裡剛好 12 個點）。
 *   2. 分片的 unicode-range 必須互斥，否則後宣告的 @font-face 會蓋掉前面的，
 *      前面那片就白下載了。
 *   3. 點陣圖示必須是 16x16。
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');

const tokensCss = readFileSync(join(webRoot, 'src/styles/tokens.css'), 'utf8');
const fontsCss = readFileSync(join(webRoot, 'src/styles/fonts.css'), 'utf8');
const iconSource = readFileSync(join(webRoot, 'src/components/PixelIcon.tsx'), 'utf8');

function readToken(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  const value = match?.[1];
  if (value === undefined) throw new Error(`tokens.css 少了 --${name}`);
  return value.trim();
}

// -----------------------------------------------------------------------------

describe('像素字級', () => {
  it.each([
    ['px-sm', 12],
    ['px-md', 24],
    ['px-lg', 36],
  ])('--%s 是 %i px', (name, expected) => {
    expect(readToken(name)).toBe(`${expected}px`);
  });

  it.each(['px-sm', 'px-md', 'px-lg'])('--%s 是 12 的整數倍', (name) => {
    const px = Number.parseInt(readToken(name), 10);
    expect(px % 12).toBe(0);
  });

  it('像素字有關掉抗鋸齒', () => {
    expect(tokensCss).toContain('-webkit-font-smoothing: none');
  });

  it('觸控範圍至少 44px', () => {
    expect(Number.parseInt(readToken('tap-min'), 10)).toBeGreaterThanOrEqual(44);
  });

  it('按下時的位移量有定義', () => {
    expect(readToken('shadow-offset')).toBe('3px');
  });
});

// -----------------------------------------------------------------------------

interface Face {
  file: string;
  ranges: [number, number][];
}

function parseFaces(): Face[] {
  const faces: Face[] = [];
  const blocks = fontsCss.split('@font-face').slice(1);

  for (const block of blocks) {
    const file = block.match(/url\('\/fonts\/([^']+)'\)/)?.[1];
    const rangeText = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!file || !rangeText) continue;

    const ranges = rangeText.split(',').map((part): [number, number] => {
      const [from = '', to] = part.trim().replace(/^U\+/i, '').split('-');
      const start = Number.parseInt(from, 16);
      return [start, to === undefined ? start : Number.parseInt(to, 16)];
    });

    faces.push({ file, ranges });
  }
  return faces;
}

describe('字型分片', () => {
  const faces = parseFaces();

  it('至少切成三片以上', () => {
    expect(faces.length).toBeGreaterThan(3);
  });

  it('core 與 ui 兩片一定存在，而且排在最前面', () => {
    expect(faces[0]?.file).toBe('cubic11-core.woff2');
    expect(faces[1]?.file).toBe('cubic11-ui.woff2');
  });

  it('每一片的 woff2 檔案都在', () => {
    for (const face of faces) {
      expect(existsSync(join(webRoot, 'public/fonts', face.file))).toBe(true);
    }
  });

  it('OFL 授權檔有一起散布', () => {
    expect(existsSync(join(webRoot, 'public/fonts/OFL.txt'))).toBe(true);
  });

  it('所有 unicode-range 互斥', () => {
    const flat = faces
      .flatMap((face) => face.ranges.map((range) => ({ file: face.file, range })))
      .sort((a, b) => a.range[0] - b.range[0]);

    for (let i = 1; i < flat.length; i += 1) {
      const prev = flat[i - 1];
      const curr = flat[i];
      if (!prev || !curr) continue;
      if (curr.range[0] <= prev.range[1]) {
        throw new Error(
          `${prev.file} 的 U+${prev.range[0].toString(16)}-${prev.range[1].toString(16)} ` +
            `和 ${curr.file} 的 U+${curr.range[0].toString(16)} 重疊`,
        );
      }
    }
    expect(flat.length).toBeGreaterThan(0);
  });

  it('每個區間的起點不大於終點', () => {
    for (const face of faces) {
      for (const [start, end] of face.ranges) {
        expect(end).toBeGreaterThanOrEqual(start);
      }
    }
  });
});

// -----------------------------------------------------------------------------

describe('點陣圖示', () => {
  const maps = [...iconSource.matchAll(/^\s{2}(\w+): \[$([\s\S]*?)^\s{2}\],$/gm)].map(
    ([, name = '', body = '']) => ({
      name,
      rows: [...body.matchAll(/'([.#]+)'/g)].map((m) => m[1] ?? ''),
    }),
  );

  it('五個分頁圖示都在', () => {
    expect(maps.map((m) => m.name).sort()).toEqual([
      'homework',
      'notes',
      'overview',
      'progress',
      'settings',
    ]);
  });

  it.each(['overview', 'homework', 'notes', 'progress', 'settings'])(
    '%s 是 16x16',
    (name) => {
      const map = maps.find((m) => m.name === name);
      expect(map?.rows).toHaveLength(16);
      for (const row of map?.rows ?? []) expect(row).toHaveLength(16);
    },
  );

  it('顯示尺寸只允許 16 的整數倍', () => {
    expect(iconSource).toContain('size?: 16 | 32 | 48;');
  });
});
