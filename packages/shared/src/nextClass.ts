/**
 * 「下堂課」日期計算。
 *
 * 依科目的上課時間與目前時間，算出下一次上課的日期時間，並跳過假日清單中的日期。
 * 所有計算都走 tz.ts，以 Asia/Taipei 為準。
 */

import {
  addDays,
  atTaipei,
  parseTimeOfDay,
  toDateKey,
  weekdayOf,
  type DateKey,
  type IsoWeekday,
} from './tz';

/** 一個上課時段。weekday 為 ISO 星期（1 = 週一 … 7 = 週日）。 */
export interface ClassSlot {
  weekday: IsoWeekday;
  /** 開始時間，HH:mm。 */
  start: string;
  /** 結束時間，HH:mm。計算下堂課時用不到，保留給行事曆顯示。 */
  end?: string;
}

export interface NextClassOptions {
  /** 基準時間。 */
  now: Date;
  /** 該科目的所有上課時段。 */
  schedule: readonly ClassSlot[];
  /** 要跳過的日期，YYYY-MM-DD。國定假日 + 學校停課日。 */
  holidays?: Iterable<string>;
  /** 最多往後找幾天，預設 120 天（約一個學期）。 */
  maxLookaheadDays?: number;
}

const DEFAULT_LOOKAHEAD_DAYS = 120;

function validateSlot(slot: ClassSlot): void {
  if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
    throw new Error(`上課時段的 weekday 須為 1–7，收到：${String(slot.weekday)}`);
  }
  parseTimeOfDay(slot.start);
}

/**
 * 往後找 count 次上課時間。
 *
 * 嚴格大於 now：如果現在剛好是上課時間，回傳的是再下一次，
 * 這樣「下堂課」在課堂上按下去才會是下一堂而不是這一堂。
 */
export function nextClassOccurrences(
  options: NextClassOptions,
  count: number,
): Date[] {
  const { now, schedule } = options;
  if (count <= 0 || schedule.length === 0) return [];
  for (const slot of schedule) validateSlot(slot);

  const holidays = new Set(options.holidays ?? []);
  const maxDays = options.maxLookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
  const startKey = toDateKey(now);
  const found: Date[] = [];

  for (let offset = 0; offset <= maxDays && found.length < count; offset += 1) {
    const key = addDays(startKey, offset);
    if (holidays.has(key)) continue;

    const weekday = weekdayOf(key);
    const todays = schedule
      .filter((slot) => slot.weekday === weekday)
      .map((slot) => atTaipei(key, slot.start))
      .filter((at) => at.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());

    found.push(...todays);
  }

  return found.slice(0, count);
}

/** 下一次上課的時間。找不到（例如整個 lookahead 都是假日）回傳 null。 */
export function nextClassDate(options: NextClassOptions): Date | null {
  return nextClassOccurrences(options, 1)[0] ?? null;
}

/**
 * 「下週同一堂」：下一次上課之後，同一個星期時段的再下一次。
 *
 * 實作上是先找出下堂課落在哪個時段，再往後找那個時段的下一次出現；
 * 中間若遇到假日會自動跳過，所以遇到連假時不一定剛好是加七天。
 */
export function nextSameSlotNextWeek(options: NextClassOptions): Date | null {
  const first = nextClassDate(options);
  if (!first) return null;

  const firstWeekday = weekdayOf(toDateKey(first));
  const sameSlots = options.schedule.filter((slot) => slot.weekday === firstWeekday);
  if (sameSlots.length === 0) return null;

  return (
    nextClassOccurrences({ ...options, now: first, schedule: sameSlots }, 1)[0] ?? null
  );
}

/**
 * 「明天」：台北時間的隔天某個時刻，預設 23:59。
 *
 * 依規格，「明天」不跳假日 —— 使用者說明天就是明天。
 */
export function tomorrow(now: Date, time = '23:59'): Date {
  return atTaipei(addDays(toDateKey(now), 1), time);
}

// =============================================================================
// 個人課表（節次制）
//
// 這一段是給 users/{uid}/timetables 用的，2026-09-23 拍板：課表完全不記上課
// 時刻，只記節次（第 1–10 節）。刻意用不同的型別與函式名稱，不動上面時刻制的
// ClassSlot / nextClassDate / nextSameSlotNextWeek / tomorrow —— 那一組是
// Subject.schedule 用的，ScheduleEditor.tsx / SubjectForm.tsx / ItemForms.tsx /
// lib/subjects.ts 都還在用，改了會整批壞掉。
// =============================================================================

/** 節次，固定第 1–10 節。 */
export type Period = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** 課表裡的一個時段（連堂存成一筆）。 */
export interface TimetableSlot {
  weekday: IsoWeekday;
  startPeriod: Period;
  endPeriod: Period;
}

export interface NextTimetableClassOptions {
  /** 基準時間，找的是這一天「明天」起的下一堂。 */
  today: Date;
  schedule: readonly TimetableSlot[];
  /** 要跳過的日期，YYYY-MM-DD。國定假日 + 學校停課日。 */
  holidays?: Iterable<string>;
  /** 最多往後找幾天，預設 120 天（約一個學期）。 */
  maxLookaheadDays?: number;
}

function validateTimetableSlot(slot: TimetableSlot): void {
  if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
    throw new Error(`課表時段的 weekday 須為 1–7，收到：${String(slot.weekday)}`);
  }
  if (
    !Number.isInteger(slot.startPeriod) ||
    slot.startPeriod < 1 ||
    slot.startPeriod > 10
  ) {
    throw new Error(`起始節須為 1–10，收到：${String(slot.startPeriod)}`);
  }
  if (
    !Number.isInteger(slot.endPeriod) ||
    slot.endPeriod < 1 ||
    slot.endPeriod > 10
  ) {
    throw new Error(`結束節須為 1–10，收到：${String(slot.endPeriod)}`);
  }
  if (slot.startPeriod > slot.endPeriod) {
    throw new Error(
      `起始節不能晚於結束節，收到 startPeriod=${slot.startPeriod}, endPeriod=${slot.endPeriod}`,
    );
  }
}

/** 「明天」的日期字串（不跳假日）。 */
export function tomorrowDateKey(today: Date): DateKey {
  return addDays(toDateKey(today), 1);
}

/** 從 startKey 開始（含當天）往後找第一個有排課、且不是假日的日期。 */
function searchTimetableDateKey(
  startKey: DateKey,
  schedule: readonly TimetableSlot[],
  holidays: Set<string>,
  maxDays: number,
): DateKey | null {
  let key = startKey;
  for (let offset = 0; offset < maxDays; offset += 1) {
    if (!holidays.has(key)) {
      const weekday = weekdayOf(key);
      if (schedule.some((slot) => slot.weekday === weekday)) return key;
    }
    key = addDays(key, 1);
  }
  return null;
}

/**
 * 下堂課的日期：從「明天」起第一個有這門課的日期（今天有課也不算），
 * 跳過國定假日與學校停課日。只回傳日期，不記時刻。找不到回傳 null。
 */
export function nextTimetableClassDate(
  options: NextTimetableClassOptions,
): DateKey | null {
  const { today, schedule } = options;
  if (schedule.length === 0) return null;
  for (const slot of schedule) validateTimetableSlot(slot);

  const holidays = new Set(options.holidays ?? []);
  const maxDays = options.maxLookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
  return searchTimetableDateKey(tomorrowDateKey(today), schedule, holidays, maxDays);
}

/**
 * 下堂課之後，同一個星期幾的下一次，同樣跳過假日。
 * 遇到假日時不一定剛好是加七天。
 */
export function nextSameTimetableSlotNextWeek(
  options: NextTimetableClassOptions,
): DateKey | null {
  const first = nextTimetableClassDate(options);
  if (!first) return null;

  const weekday = weekdayOf(first);
  const sameSlots = options.schedule.filter((slot) => slot.weekday === weekday);
  const holidays = new Set(options.holidays ?? []);
  const maxDays = options.maxLookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
  return searchTimetableDateKey(addDays(first, 1), sameSlots, holidays, maxDays);
}
