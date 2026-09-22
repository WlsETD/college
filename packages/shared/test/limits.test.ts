import { describe, expect, it } from 'vitest';

import {
  BLOCKED_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
  UPLOAD_REJECTION_MESSAGE,
  checkUpload,
} from '../src/limits';

const file = (size: number, type: string) => ({ size, type });

describe('MAX_UPLOAD_BYTES', () => {
  it('是 30 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(31_457_280);
  });
});

describe('checkUpload', () => {
  it('一般檔案通過', () => {
    expect(checkUpload(file(1024, 'image/png'))).toBeNull();
  });

  it('剛好 30 MB 通過', () => {
    expect(checkUpload(file(MAX_UPLOAD_BYTES, 'application/pdf'))).toBeNull();
  });

  it('30 MB 加一個位元組被擋', () => {
    expect(checkUpload(file(MAX_UPLOAD_BYTES + 1, 'application/pdf'))).toBe('too-large');
  });

  it.each(['video/mp4', 'video/quicktime', 'VIDEO/MP4'])('%s 被擋', (type) => {
    expect(checkUpload(file(1024, type))).toBe('blocked-type');
  });

  it('audio 不在封鎖範圍', () => {
    expect(checkUpload(file(1024, 'audio/mp4'))).toBeNull();
  });

  it('沒有 contentType 被擋', () => {
    expect(checkUpload(file(1024, ''))).toBe('unknown-type');
  });

  it('型別優先於大小：超大的影片回報的是影片', () => {
    expect(checkUpload(file(MAX_UPLOAD_BYTES * 2, 'video/mp4'))).toBe('blocked-type');
  });

  it('每一種拒絕原因都有訊息', () => {
    for (const reason of ['too-large', 'blocked-type', 'unknown-type'] as const) {
      expect(UPLOAD_REJECTION_MESSAGE[reason]).toBeTruthy();
    }
  });
});

describe('BLOCKED_CONTENT_TYPE', () => {
  it('只擋開頭是 video/ 的', () => {
    expect(BLOCKED_CONTENT_TYPE.test('video/mp4')).toBe(true);
    expect(BLOCKED_CONTENT_TYPE.test('application/x-video')).toBe(false);
  });
});
