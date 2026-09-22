import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TZ,
  addDays,
  atTaipei,
  diffDays,
  formatDateKey,
  fromCivil,
  offsetMs,
  parseDateKey,
  parseTimeOfDay,
  startOfDay,
  toCivil,
  toDateKey,
  weekdayOf,
} from '../src/tz';

const HOUR = 3_600_000;

describe('tz — 固定 Asia/Taipei', () => {
  // 這組測試會把行程的時區改成別的地方，確認計算結果完全不受影響。
  const originalTZ = process.env.TZ;

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('時區常數就是 Asia/Taipei', () => {
    expect(TZ).toBe('Asia/Taipei');
  });

  it('台北恆為 UTC+8，全年無日光節約', () => {
    const winter = new Date('2026-01-15T00:00:00Z');
    const summer = new Date('2026-07-15T00:00:00Z');
    expect(offsetMs(winter)).toBe(8 * HOUR);
    expect(offsetMs(summer)).toBe(8 * HOUR);
  });

  it('toCivil 把瞬間換算成台北當地時間', () => {
    // UTC 2026-09-22 16:30 → 台北 2026-09-23 00:30
    expect(toCivil(new Date('2026-09-22T16:30:00Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 23,
      hour: 0,
      minute: 30,
      second: 0,
    });
  });

  it('午夜會正規化成 0 時而不是 24 時', () => {
    const midnight = new Date('2026-09-22T16:00:00Z'); // 台北 09-23 00:00
    expect(toCivil(midnight).hour).toBe(0);
    expect(toCivil(midnight).day).toBe(23);
  });

  it('fromCivil 與 toCivil 互為反函式', () => {
    const civil = { year: 2027, month: 2, day: 5, hour: 9, minute: 10, second: 0 };
    expect(toCivil(fromCivil(civil))).toEqual(civil);
  });

  it('fromCivil 算出正確的 UTC 瞬間', () => {
    const at = fromCivil({ year: 2026, month: 9, day: 25, hour: 9, minute: 10 });
    expect(at.toISOString()).toBe('2026-09-25T01:10:00.000Z');
  });

  it('跨年邊界正確', () => {
    const at = fromCivil({ year: 2027, month: 1, day: 1, hour: 0, minute: 0 });
    expect(at.toISOString()).toBe('2026-12-31T16:00:00.000Z');
    expect(toDateKey(at)).toBe('2027-01-01');
  });
});

describe('tz — 不依賴行程預設時區', () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    // 故意設成西半球，若實作誤用了 getHours() 之類的本地方法就會露餡。
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('在美東時區下，台北日期仍然正確', () => {
    // 這個瞬間在紐約是 09-22 晚上，在台北已經是 09-23。
    const instant = new Date('2026-09-22T23:00:00Z');
    expect(toDateKey(instant)).toBe('2026-09-23');
    expect(toCivil(instant).hour).toBe(7);
  });

  it('在美東時區下，fromCivil 仍以台北為準', () => {
    const at = fromCivil({ year: 2026, month: 9, day: 25, hour: 9, minute: 10 });
    expect(at.toISOString()).toBe('2026-09-25T01:10:00.000Z');
  });
});

describe('tz — 日期字串工具', () => {
  it('toDateKey 補零', () => {
    expect(toDateKey(new Date('2027-02-04T16:00:00Z'))).toBe('2027-02-05');
    expect(toDateKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('parseDateKey 拒絕格式錯誤', () => {
    expect(() => parseDateKey('2026-9-1')).toThrow();
    expect(() => parseDateKey('20260901')).toThrow();
    expect(() => parseDateKey('')).toThrow();
  });

  it('parseDateKey 拒絕不存在的日期', () => {
    expect(() => parseDateKey('2026-02-30')).toThrow();
    expect(() => parseDateKey('2026-13-01')).toThrow();
    // 2027 不是閏年
    expect(() => parseDateKey('2027-02-29')).toThrow();
  });

  it('parseDateKey 接受閏日', () => {
    expect(parseDateKey('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('formatDateKey 與 parseDateKey 互為反函式', () => {
    expect(formatDateKey(parseDateKey('2026-09-25'))).toBe('2026-09-25');
  });

  it('weekdayOf 用 ISO 編號，週一為 1', () => {
    expect(weekdayOf('2026-09-21')).toBe(1); // 週一
    expect(weekdayOf('2026-09-25')).toBe(5); // 週五
    expect(weekdayOf('2026-09-27')).toBe(7); // 週日
  });

  it('addDays 跨月跨年', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-09-25', 0)).toBe('2026-09-25');
  });

  it('diffDays 計算天數差', () => {
    expect(diffDays('2026-09-25', '2026-10-02')).toBe(7);
    expect(diffDays('2026-10-02', '2026-09-25')).toBe(-7);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('tz — 時刻工具', () => {
  it('parseTimeOfDay 接受 H:mm 與 HH:mm', () => {
    expect(parseTimeOfDay('9:10')).toEqual({ hour: 9, minute: 10 });
    expect(parseTimeOfDay('09:10')).toEqual({ hour: 9, minute: 10 });
    expect(parseTimeOfDay(' 23:59 ')).toEqual({ hour: 23, minute: 59 });
  });

  it('parseTimeOfDay 拒絕超出範圍或格式錯誤', () => {
    expect(() => parseTimeOfDay('24:00')).toThrow();
    expect(() => parseTimeOfDay('09:60')).toThrow();
    expect(() => parseTimeOfDay('0910')).toThrow();
  });

  it('atTaipei 組出當地時刻', () => {
    expect(atTaipei('2026-09-25', '09:10').toISOString()).toBe('2026-09-25T01:10:00.000Z');
  });

  it('startOfDay 回到台北當日零時', () => {
    const noon = new Date('2026-09-25T04:00:00Z'); // 台北 12:00
    expect(startOfDay(noon).toISOString()).toBe('2026-09-24T16:00:00.000Z');
    expect(toDateKey(startOfDay(noon))).toBe('2026-09-25');
  });
});
