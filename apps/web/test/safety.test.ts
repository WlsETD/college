/**
 * 守住幾個「兩邊要一致」與「不能放寬」的設定。
 *
 * 這些東西分散在安全規則、前端程式與共用常數裡，沒有型別系統幫忙，
 * 改一邊忘了改另一邊不會有任何徵兆，所以用測試釘住。
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from '@jindu/shared';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const repoRoot = resolve(webRoot, '../..');

const storageRules = readFileSync(join(repoRoot, 'storage.rules'), 'utf8');
const firestoreRules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8');
const mathText = readFileSync(join(webRoot, 'src/components/MathText.tsx'), 'utf8');
const converters = readFileSync(join(webRoot, 'src/lib/converters.ts'), 'utf8');

describe('上傳限制：storage.rules 與 @jindu/shared 要一致', () => {
  it('規則裡的上限就是 MAX_UPLOAD_BYTES', () => {
    const match = storageRules.match(/request\.resource\.size\s*<=\s*([\d\s*]+);/);
    expect(match).not.toBeNull();
    // eslint-disable-next-line no-eval -- 只是把 "30 * 1024 * 1024" 這種算式算出來
    const value = Number(eval((match as RegExpMatchArray)[1] as string));
    expect(value).toBe(MAX_UPLOAD_BYTES);
  });

  it('規則有擋 video/*', () => {
    expect(storageRules).toMatch(/!request\.resource\.contentType\.matches\('video\/\.\*'\)/);
  });

  it('規則禁止刪除 Storage 物件', () => {
    expect(storageRules).toMatch(/allow delete:\s*if false/);
  });
});

describe('KaTeX 的設定不能放寬', () => {
  it('trust 為 false', () => {
    expect(mathText).toContain('trust: false');
  });

  it('strict 為 warn', () => {
    expect(mathText).toContain("strict: 'warn'");
  });

  it('沒有把 trust 打開的漏網之魚', () => {
    expect(mathText).not.toMatch(/trust:\s*(true|\()/);
  });
});

describe('軟刪除', () => {
  it('firestore.rules 對每一種文件的 delete 都是 if false', () => {
    const deleteRules = storageRules.match(/allow delete:[^;]*;/g) ?? [];
    const firestoreDeletes = firestoreRules.match(/allow delete:[^;]*;/g) ?? [];
    expect(firestoreDeletes.length).toBeGreaterThan(0);
    for (const rule of [...deleteRules, ...firestoreDeletes]) {
      expect(rule).toMatch(/if false/);
    }
  });

  it('前端的軟刪除寫的是 serverTimestamp()，規則會比對 request.time', () => {
    expect(converters).toMatch(/softDeleteFields[\s\S]*?deletedAt: serverTimestamp\(\)/);
  });

  it('復原是把 deletedAt 改回 null', () => {
    expect(converters).toMatch(/restoreFields[\s\S]*?deletedAt: null/);
  });
});
