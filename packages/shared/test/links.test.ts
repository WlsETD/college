import { describe, expect, it } from 'vitest';

import { normalizeUrl } from '../src/links';

describe('normalizeUrl', () => {
  it('https 原樣保留', () => {
    expect(normalizeUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it('http 也接受', () => {
    expect(normalizeUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('沒寫 scheme 的補 https', () => {
    expect(normalizeUrl('example.com/notes')).toBe('https://example.com/notes');
  });

  it('前後空白會去掉', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com/');
  });

  it('空字串回傳 null', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['大小寫混合的 javascript', 'JaVaScRiPt:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['file', 'file:///etc/passwd'],
    ['mailto', 'mailto:someone@example.com'],
  ])('%s 被擋掉', (_label, value) => {
    expect(normalizeUrl(value)).toBeNull();
  });

  it('查詢字串與 hash 保留', () => {
    expect(normalizeUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
  });

  it('中文網址會被編碼', () => {
    expect(normalizeUrl('https://example.com/筆記')).toContain('%E7%AD%86%E8%A8%98');
  });

  it('沒有主機名稱的回傳 null', () => {
    expect(normalizeUrl('https://')).toBeNull();
  });
});
