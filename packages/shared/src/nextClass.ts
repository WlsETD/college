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
