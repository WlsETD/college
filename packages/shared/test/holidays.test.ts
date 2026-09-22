import { describe, it, expect } from 'vitest';
import { holidayDates, holidayFile, holidayName, isHoliday } from '../src/holidays';
import { diffDays, parseDateKey, weekdayOf } from '../src/tz';

describe('holidays.json — 資料完整性', () => {
  it('每一筆都是合法且存在的日期', () => {
    for (const entry of [...holidayFile.holidays, ...holidayFile.schoolClosures]) {
      expect(() => parseDateKey(entry.date), `${entry.date} ${entry.name}`).not.toThrow();
    }
  });

  it('每一筆都有名稱與型別', () => {
    for (const entry of holidayFile.holidays) {
      expect(entry.name.length, entry.date).toBeGreaterThan(0);
      expect(['national', 'observed', 'weekend', 'school']).toContain(entry.type);
    }
  });

  it('日期已排序且沒有重複', () => {
    const dates = holidayFile.holidays.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('全部落在宣告的學年範圍內', () => {
    for (const entry of holidayFile.holidays) {
      expect(diffDays(holidayFile.rangeStart, entry.date), entry.date).toBeGreaterThanOrEqual(0);
      expect(diffDays(entry.date, holidayFile.rangeEnd), entry.date).toBeGreaterThanOrEqual(0);
    }
  });

  it('標為 weekend 的確實落在週六或週日', () => {
    for (const entry of holidayFile.holidays) {
      if (entry.type !== 'weekend') continue;
      expect(weekdayOf(entry.date), `${entry.date} ${entry.name}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('標為 observed（補假）的落在平日', () => {
    for (const entry of holidayFile.holidays) {
      if (entry.type !== 'observed') continue;
      expect(weekdayOf(entry.date), `${entry.date} ${entry.name}`).toBeLessThanOrEqual(5);
    }
  });

  it('尚未經人工核對 —— 核對完請把 verified 改成 true 並移除這個測試', () => {
    // 這個測試存在的目的是讓 pnpm test 持續提醒：資料還沒有人確認過。
    expect(holidayFile.verified).toBe(false);
  });

  it('有標註資料來源', () => {
    expect(holidayFile.sources.length).toBeGreaterThan(0);
  });
});

describe('holidayDates', () => {
  it('預設不含純週末的連假日', () => {
    const dates = holidayDates();
    expect(dates).toContain('2026-09-25'); // 中秋節，週五
    expect(dates).not.toContain('2026-09-26'); // 週六
  });

  it('includeWeekend 可以把週末納入', () => {
    expect(holidayDates({ includeWeekend: true })).toContain('2026-09-26');
  });

  it('回傳結果已排序且去重', () => {
    const dates = holidayDates({ extra: ['2026-09-25', '2026-11-11'] });
    expect(dates).toEqual([...new Set(dates)].sort());
    expect(dates).toContain('2026-11-11');
  });

  it('extra 可以加入學校自訂停課日', () => {
    expect(holidayDates({ extra: ['2026-11-11'] })).toContain('2026-11-11');
    expect(holidayDates()).not.toContain('2026-11-11');
  });

  it('學校停課日清單目前是空的，需要使用者補上', () => {
    expect(holidayFile.schoolClosures).toEqual([]);
  });
});

describe('isHoliday / holidayName', () => {
  it('國定假日', () => {
    expect(isHoliday('2026-09-25')).toBe(true);
    expect(holidayName('2026-09-25')).toBe('中秋節');
  });

  it('補假', () => {
    expect(isHoliday('2026-10-26')).toBe(true);
    expect(holidayName('2026-10-26')).toBe('光復節補假');
  });

  it('平常上課日', () => {
    expect(isHoliday('2026-09-22')).toBe(false);
    expect(holidayName('2026-09-22')).toBeNull();
  });
});
