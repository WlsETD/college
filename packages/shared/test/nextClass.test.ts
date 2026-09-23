import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  nextClassDate,
  nextClassOccurrences,
  nextSameSlotNextWeek,
  nextTimetableClassDate,
  nextSameTimetableSlotNextWeek,
  tomorrow,
  tomorrowDateKey,
  type ClassSlot,
  type TimetableSlot,
} from '../src/nextClass';
import { atTaipei, toDateKey } from '../src/tz';

/** 週二 09:10 與 週五 13:20 各一堂。 */
const SCHEDULE: ClassSlot[] = [
  { weekday: 2, start: '09:10', end: '12:00' },
  { weekday: 5, start: '13:20', end: '16:00' },
];

/** 2026-09-22 是週二。 */
const TUE_0800 = atTaipei('2026-09-22', '08:00');
const TUE_1000 = atTaipei('2026-09-22', '10:00');

describe('nextClassDate — 基本情境', () => {
  it('當天稍早 → 就是當天那一堂', () => {
    const at = nextClassDate({ now: TUE_0800, schedule: SCHEDULE });
    expect(at && toDateKey(at)).toBe('2026-09-22');
    expect(at?.toISOString()).toBe('2026-09-22T01:10:00.000Z');
  });

  it('當天上課時間之後 → 跳到本週的下一堂', () => {
    const at = nextClassDate({ now: TUE_1000, schedule: SCHEDULE });
    expect(at && toDateKey(at)).toBe('2026-09-25');
  });

  it('剛好是上課時間 → 回傳下一堂，不是這一堂', () => {
    const exact = atTaipei('2026-09-22', '09:10');
    const at = nextClassDate({ now: exact, schedule: SCHEDULE });
    expect(at && toDateKey(at)).toBe('2026-09-25');
  });

  it('週末 → 跳到下週一之後的第一堂', () => {
    const sat = atTaipei('2026-09-26', '10:00');
    const at = nextClassDate({ now: sat, schedule: SCHEDULE });
    expect(at && toDateKey(at)).toBe('2026-09-29'); // 下週二
  });

  it('單一時段的科目', () => {
    const at = nextClassDate({
      now: TUE_1000,
      schedule: [{ weekday: 2, start: '09:10' }],
    });
    expect(at && toDateKey(at)).toBe('2026-09-29');
  });

  it('沒有上課時間 → null', () => {
    expect(nextClassDate({ now: TUE_0800, schedule: [] })).toBeNull();
  });
});

describe('nextClassDate — 跳過假日', () => {
  // 2026-09-25（週五）中秋節、2026-09-28（週一）教師節
  const holidays = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];

  it('下一堂落在假日 → 跳過，往後找', () => {
    const at = nextClassDate({ now: TUE_1000, schedule: SCHEDULE, holidays });
    // 週五 9/25 中秋停課 → 下一堂是 9/29 週二
    expect(at && toDateKey(at)).toBe('2026-09-29');
    expect(at?.toISOString()).toBe('2026-09-29T01:10:00.000Z');
  });

  it('連假整段跳過', () => {
    const springFestival = [
      '2027-02-04', '2027-02-05', '2027-02-06', '2027-02-07',
      '2027-02-08', '2027-02-09', '2027-02-10',
    ];
    // 2027-02-02 是週二
    const at = nextClassDate({
      now: atTaipei('2027-02-02', '10:00'),
      schedule: SCHEDULE,
      holidays: springFestival,
    });
    // 2/5 週五停課、2/9 週二停課 → 下一堂是 2/12 週五
    expect(at && toDateKey(at)).toBe('2027-02-12');
  });

  it('假日清單用 Set 也可以', () => {
    const at = nextClassDate({
      now: TUE_1000,
      schedule: SCHEDULE,
      holidays: new Set(holidays),
    });
    expect(at && toDateKey(at)).toBe('2026-09-29');
  });

  it('清單裡與課程無關的假日不影響結果', () => {
    const at = nextClassDate({
      now: TUE_1000,
      schedule: SCHEDULE,
      holidays: ['2026-09-23', '2026-09-24'], // 週三、週四本來就沒課
    });
    expect(at && toDateKey(at)).toBe('2026-09-25');
  });

  it('lookahead 內全是假日 → null', () => {
    const allHolidays: string[] = [];
    for (let d = 22; d <= 30; d += 1) allHolidays.push(`2026-09-${d}`);
    const at = nextClassDate({
      now: TUE_1000,
      schedule: SCHEDULE,
      holidays: allHolidays,
      maxLookaheadDays: 7,
    });
    expect(at).toBeNull();
  });
});

describe('nextClassOccurrences', () => {
  it('依序回傳多次上課時間', () => {
    const list = nextClassOccurrences({ now: TUE_0800, schedule: SCHEDULE }, 4);
    expect(list.map(toDateKey)).toEqual([
      '2026-09-22',
      '2026-09-25',
      '2026-09-29',
      '2026-10-02',
    ]);
  });

  it('同一天有兩堂時依時間排序', () => {
    const twice: ClassSlot[] = [
      { weekday: 2, start: '15:30' },
      { weekday: 2, start: '09:10' },
    ];
    const list = nextClassOccurrences({ now: TUE_0800, schedule: twice }, 2);
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-09-22T01:10:00.000Z',
      '2026-09-22T07:30:00.000Z',
    ]);
  });

  it('count 為 0 或負數回傳空陣列', () => {
    expect(nextClassOccurrences({ now: TUE_0800, schedule: SCHEDULE }, 0)).toEqual([]);
    expect(nextClassOccurrences({ now: TUE_0800, schedule: SCHEDULE }, -1)).toEqual([]);
  });
});

describe('nextSameSlotNextWeek — 下週同一堂', () => {
  it('回到同一個星期時段的下一次', () => {
    const at = nextSameSlotNextWeek({ now: TUE_1000, schedule: SCHEDULE });
    // 下一堂是 9/25 週五 → 下週同一堂是 10/2 週五
    expect(at && toDateKey(at)).toBe('2026-10-02');
  });

  it('當天稍早時，下一堂是今天，下週同一堂是七天後', () => {
    const at = nextSameSlotNextWeek({ now: TUE_0800, schedule: SCHEDULE });
    expect(at && toDateKey(at)).toBe('2026-09-29');
  });

  it('下週同一堂遇到假日會再往後跳', () => {
    const at = nextSameSlotNextWeek({
      now: TUE_0800,
      schedule: SCHEDULE,
      holidays: ['2026-09-29'],
    });
    expect(at && toDateKey(at)).toBe('2026-10-06');
  });

  it('沒有課回傳 null', () => {
    expect(nextSameSlotNextWeek({ now: TUE_0800, schedule: [] })).toBeNull();
  });
});

describe('tomorrow — 明天不跳假日', () => {
  it('預設 23:59', () => {
    const at = tomorrow(TUE_1000);
    expect(toDateKey(at)).toBe('2026-09-23');
    expect(at.toISOString()).toBe('2026-09-23T15:59:00.000Z');
  });

  it('可以指定時刻', () => {
    expect(tomorrow(TUE_1000, '09:00').toISOString()).toBe('2026-09-23T01:00:00.000Z');
  });

  it('跨月跨年', () => {
    expect(toDateKey(tomorrow(atTaipei('2026-12-31', '20:00')))).toBe('2027-01-01');
  });

  it('明天是假日也照樣回傳明天', () => {
    // 這是刻意的：使用者說明天就是明天，不因為放假而改。
    expect(toDateKey(tomorrow(atTaipei('2026-09-24', '10:00')))).toBe('2026-09-25');
  });
});

describe('nextClassDate — 輸入驗證', () => {
  it('weekday 超出 1–7 會丟出例外', () => {
    expect(() =>
      nextClassDate({ now: TUE_0800, schedule: [{ weekday: 0 as 1, start: '09:10' }] }),
    ).toThrow();
    expect(() =>
      nextClassDate({ now: TUE_0800, schedule: [{ weekday: 8 as 1, start: '09:10' }] }),
    ).toThrow();
  });

  it('start 格式錯誤會丟出例外', () => {
    expect(() =>
      nextClassDate({ now: TUE_0800, schedule: [{ weekday: 2, start: '0910' }] }),
    ).toThrow();
  });
});

// =============================================================================
// 個人課表（節次制）
// =============================================================================

/** 週二第 3–4 節、週五第 6–7 節各一堂。 */
const TIMETABLE: TimetableSlot[] = [
  { weekday: 2, startPeriod: 3, endPeriod: 4 },
  { weekday: 5, startPeriod: 6, endPeriod: 7 },
];

describe('nextTimetableClassDate — 基本情境', () => {
  it('今天有課也不算，從明天開始找', () => {
    // 2026-09-22 是週二，TIMETABLE 週二有課，但「今天」不算。
    const key = nextTimetableClassDate({ today: TUE_0800, schedule: TIMETABLE });
    expect(key).toBe('2026-09-25'); // 本週五
  });

  it('明天剛好有課', () => {
    // 2026-09-24 是週四，明天（週五）有課。
    const key = nextTimetableClassDate({
      today: atTaipei('2026-09-24', '08:00'),
      schedule: TIMETABLE,
    });
    expect(key).toBe('2026-09-25');
  });

  it('週末 → 跳到下週二', () => {
    const key = nextTimetableClassDate({
      today: atTaipei('2026-09-26', '10:00'),
      schedule: TIMETABLE,
    });
    expect(key).toBe('2026-09-29');
  });

  it('沒有排課 → null', () => {
    expect(nextTimetableClassDate({ today: TUE_0800, schedule: [] })).toBeNull();
  });

  it('只回傳日期字串，不含時刻資訊', () => {
    const key = nextTimetableClassDate({ today: TUE_0800, schedule: TIMETABLE });
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('nextTimetableClassDate — 跳過假日', () => {
  it('下一堂落在假日 → 跳過，往後找', () => {
    // 週五 9/25 中秋停課 → 下一堂是 9/29 週二
    const key = nextTimetableClassDate({
      today: TUE_0800,
      schedule: TIMETABLE,
      holidays: ['2026-09-25'],
    });
    expect(key).toBe('2026-09-29');
  });

  it('lookahead 內全是假日 → null', () => {
    const allHolidays: string[] = [];
    for (let d = 23; d <= 30; d += 1) allHolidays.push(`2026-09-${d}`);
    const key = nextTimetableClassDate({
      today: TUE_0800,
      schedule: TIMETABLE,
      holidays: allHolidays,
      maxLookaheadDays: 7,
    });
    expect(key).toBeNull();
  });
});

describe('nextTimetableClassDate — 輸入驗證', () => {
  it('weekday 超出 1–7 會丟出例外', () => {
    expect(() =>
      nextTimetableClassDate({
        today: TUE_0800,
        schedule: [{ weekday: 0 as 1, startPeriod: 1, endPeriod: 1 }],
      }),
    ).toThrow();
  });

  it('節次超出 1–10 會丟出例外', () => {
    expect(() =>
      nextTimetableClassDate({
        today: TUE_0800,
        schedule: [{ weekday: 2, startPeriod: 1, endPeriod: 11 as 10 }],
      }),
    ).toThrow();
  });

  it('startPeriod 晚於 endPeriod 會丟出例外', () => {
    expect(() =>
      nextTimetableClassDate({
        today: TUE_0800,
        schedule: [{ weekday: 2, startPeriod: 5, endPeriod: 3 }],
      }),
    ).toThrow();
  });
});

describe('nextSameTimetableSlotNextWeek — 下週同一堂', () => {
  it('回到同一個星期時段的下一次', () => {
    const key = nextSameTimetableSlotNextWeek({ today: TUE_0800, schedule: TIMETABLE });
    // 下一堂是 9/25 週五 → 下週同一堂是 10/2 週五
    expect(key).toBe('2026-10-02');
  });

  it('下週同一堂遇到假日會再往後跳', () => {
    const key = nextSameTimetableSlotNextWeek({
      today: TUE_0800,
      schedule: TIMETABLE,
      holidays: ['2026-10-02'],
    });
    expect(key).toBe('2026-10-09');
  });

  it('沒有排課 → null', () => {
    expect(nextSameTimetableSlotNextWeek({ today: TUE_0800, schedule: [] })).toBeNull();
  });
});

describe('tomorrowDateKey — 明天不跳假日', () => {
  it('回傳明天的日期字串', () => {
    expect(tomorrowDateKey(TUE_0800)).toBe('2026-09-23');
  });

  it('跨月跨年', () => {
    expect(tomorrowDateKey(atTaipei('2026-12-31', '20:00'))).toBe('2027-01-01');
  });

  it('明天是假日也照樣回傳明天', () => {
    expect(tomorrowDateKey(atTaipei('2026-09-24', '10:00'))).toBe('2026-09-25');
  });
});

describe('個人課表節次制計算 — 在 TZ=America/New_York 下重跑', () => {
  // 和 tz.test.ts 一樣的守則：故意把行程時區改成西半球，
  // 確認實作全程走 tz.ts、沒有誤用 Date 的本地時間方法。
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('nextTimetableClassDate 不受行程時區影響', () => {
    const key = nextTimetableClassDate({ today: TUE_0800, schedule: TIMETABLE });
    expect(key).toBe('2026-09-25');
  });

  it('nextSameTimetableSlotNextWeek 不受行程時區影響', () => {
    const key = nextSameTimetableSlotNextWeek({ today: TUE_0800, schedule: TIMETABLE });
    expect(key).toBe('2026-10-02');
  });

  it('tomorrowDateKey 不受行程時區影響', () => {
    expect(tomorrowDateKey(atTaipei('2026-12-31', '20:00'))).toBe('2027-01-01');
  });
});
