import { describe, expect, it } from 'vitest';

import {
  MAX_EXPIRY_DAYS,
  TOKEN_BYTES,
  generateToken,
  hashEquals,
  hashToken,
  inviteRejection,
  inviteUrl,
  isInviteUsable,
  looksLikeToken,
  normalizeExpiresAt,
} from '../src/lib/invite';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_770_000_000_000;

const usable = { expiresAt: null, revokedAt: null, deletedAt: null };

describe('generateToken', () => {
  it('至少 128 bit', () => {
    expect(TOKEN_BYTES * 8).toBeGreaterThanOrEqual(128);
  });

  it('是 base64url，沒有需要跳脫的字元', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('每次都不一樣', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(seen.size).toBe(200);
  });

  it('產生的 token 通過自己的格式檢查', () => {
    expect(looksLikeToken(generateToken())).toBe(true);
  });
});

describe('hashToken', () => {
  it('是 SHA-256 的 hex', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('同樣的輸入得到同樣的結果', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('不同的輸入得到不同的結果', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('明碼不會出現在 hash 裡', () => {
    const token = generateToken();
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('looksLikeToken', () => {
  it.each([
    ['非字串', 123],
    ['null', null],
    ['undefined', undefined],
    ['空字串', ''],
    ['太短', 'abc'],
    ['有斜線', 'a/b'.padEnd(20, 'x')],
    ['有加號', 'a+b'.padEnd(20, 'x')],
    ['有空白', 'a b'.padEnd(20, 'x')],
    ['太長', 'a'.repeat(129)],
  ])('%s 應被擋掉', (_label, value) => {
    expect(looksLikeToken(value)).toBe(false);
  });

  it('合法長度的 base64url 會通過', () => {
    expect(looksLikeToken('a'.repeat(32))).toBe(true);
  });
});

describe('hashEquals', () => {
  it('相同的 hash 回傳 true', () => {
    const h = hashToken('x');
    expect(hashEquals(h, h)).toBe(true);
  });

  it('不同的 hash 回傳 false', () => {
    expect(hashEquals(hashToken('x'), hashToken('y'))).toBe(false);
  });

  it('長度不同時不會丟例外', () => {
    expect(hashEquals('abc', 'abcd')).toBe(false);
  });
});

describe('inviteRejection', () => {
  it('沒有到期也沒撤銷就是可用', () => {
    expect(inviteRejection(usable, NOW)).toBeNull();
    expect(isInviteUsable(usable, NOW)).toBe(true);
  });

  it('已軟刪除', () => {
    expect(inviteRejection({ ...usable, deletedAt: NOW - 1 }, NOW)).toBe('deleted');
  });

  it('已撤銷', () => {
    expect(inviteRejection({ ...usable, revokedAt: NOW - 1 }, NOW)).toBe('revoked');
  });

  it('已過期', () => {
    expect(inviteRejection({ ...usable, expiresAt: NOW - 1 }, NOW)).toBe('expired');
  });

  it('剛好到期的那一毫秒算過期', () => {
    expect(inviteRejection({ ...usable, expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('還沒到期就可用', () => {
    expect(inviteRejection({ ...usable, expiresAt: NOW + 1 }, NOW)).toBeNull();
  });

  it('軟刪除優先於其他原因', () => {
    expect(
      inviteRejection({ expiresAt: NOW - 1, revokedAt: NOW - 1, deletedAt: NOW - 1 }, NOW),
    ).toBe('deleted');
  });
});

describe('normalizeExpiresAt', () => {
  it('null 代表永不過期', () => {
    expect(normalizeExpiresAt(null, NOW)).toBeNull();
    expect(normalizeExpiresAt(undefined, NOW)).toBeNull();
  });

  it('未來的時間直接採用', () => {
    expect(normalizeExpiresAt(NOW + 7 * DAY, NOW)).toBe(NOW + 7 * DAY);
  });

  it('過去的時間會被拒絕', () => {
    expect(() => normalizeExpiresAt(NOW - 1, NOW)).toThrow(RangeError);
  });

  it('現在這一刻也會被拒絕', () => {
    expect(() => normalizeExpiresAt(NOW, NOW)).toThrow(RangeError);
  });

  it('超過上限的天數會被拒絕', () => {
    expect(() => normalizeExpiresAt(NOW + (MAX_EXPIRY_DAYS + 1) * DAY, NOW)).toThrow(RangeError);
  });

  it('剛好落在上限上是允許的', () => {
    const at = NOW + MAX_EXPIRY_DAYS * DAY;
    expect(normalizeExpiresAt(at, NOW)).toBe(at);
  });

  it.each([['字串', '123'], ['NaN', Number.NaN], ['Infinity', Number.POSITIVE_INFINITY], ['物件', {}]])(
    '%s 會被拒絕',
    (_label, value) => {
      expect(() => normalizeExpiresAt(value, NOW)).toThrow(RangeError);
    },
  );
});

describe('inviteUrl', () => {
  it('組出 /join/:token', () => {
    expect(inviteUrl('https://jindu.example', 'abc')).toBe('https://jindu.example/join/abc');
  });

  it('結尾多餘的斜線會被吃掉', () => {
    expect(inviteUrl('https://jindu.example//', 'abc')).toBe('https://jindu.example/join/abc');
  });
});
