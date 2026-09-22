/**
 * 固定時區工具。
 *
 * 全專案的日期計算一律以 Asia/Taipei 為準，不讀取伺服器或瀏覽器的預設時區。
 * 這裡刻意不引入日期函式庫：台北時區的需求只有「瞬間 ↔ 當地日曆時間」的互轉，
 * 用 Intl.DateTimeFormat 實作約四十行，前端與 Cloud Functions 共用同一份，
 * 也不必為了單一時區在兩個 bundle 裡各塞一份 tz database。
 */

export const TZ = 'Asia/Taipei';

/** 台北當地的日曆時間（不含時區資訊）。month 為 1–12。 */
export interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** 只有日期的部分。 */
export type CivilDate = Pick<CivilDateTime, 'year' | 'month' | 'day'>;

/** ISO 8601 的星期編號：1 = 週一 … 7 = 週日。 */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 把某個瞬間換算成台北當地的日曆時間。 */
export function toCivil(instant: Date): CivilDateTime {
  const parts = PARTS_FORMATTER.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new Error(`Intl 未提供 ${type}`);
    return Number(found.value);
  };
  // 部分 ICU 版本會把午夜格式化成 24 時，正規化回 0。
  const rawHour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** 某個瞬間在台北的 UTC 位移（毫秒）。台北無日光節約，恆為 +8 小時。 */
export function offsetMs(instant: Date): number {
  const civil = toCivil(instant);
  const asIfUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
  // 去掉毫秒再相減，否則位移會混入不足一秒的尾數。
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asIfUtc - truncated;
}

/**
 * 把台北當地的日曆時間換算回瞬間。
 *
 * 先用「當成 UTC」的猜測值取得位移，再以該位移修正一次。台北沒有日光節約，
 * 一次修正就會收斂；保留兩次計算是為了讓這個函式在時區改動時仍然正確。
 */
export function fromCivil(civil: CivilDate & Partial<CivilDateTime>): Date {
  const asIfUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour ?? 0,
    civil.minute ?? 0,
    civil.second ?? 0,
  );
  let ts = asIfUtc - offsetMs(new Date(asIfUtc));
  ts = asIfUtc - offsetMs(new Date(ts));
  return new Date(ts);
}

/** 某個瞬間在台北的日期字串，格式 YYYY-MM-DD。 */
export function toDateKey(instant: Date): string {
  const c = toCivil(instant);
  return `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
}

/** 解析 YYYY-MM-DD。格式錯誤或日期不存在（例如 2026-02-30）都會丟出例外。 */
export function parseDateKey(key: string): CivilDate {
  const m = DATE_KEY_RE.exec(key);
  if (!m) throw new Error(`日期格式須為 YYYY-MM-DD，收到：${key}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`日期不存在：${key}`);
  }
  return { year, month, day };
}

/** 把 CivilDate 轉回 YYYY-MM-DD。 */
export function formatDateKey(date: CivilDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

/** 某個日期是星期幾（1 = 週一 … 7 = 週日）。 */
export function weekdayOf(key: string): IsoWeekday {
  const { year, month, day } = parseDateKey(key);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (dow === 0 ? 7 : dow) as IsoWeekday;
}

/** 日期字串加減天數，跨月跨年由 UTC 曆法處理。 */
export function addDays(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate(),
  )}`;
}

/** 解析 HH:mm。 */
export function parseTimeOfDay(time: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(time.trim());
  if (!m) throw new Error(`時間格式須為 HH:mm，收到：${time}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`時間超出範圍：${time}`);
  return { hour, minute };
}

/** 台北當地某一天的指定時刻。 */
export function atTaipei(key: string, time: string): Date {
  return fromCivil({ ...parseDateKey(key), ...parseTimeOfDay(time) });
}

/** 台北當地的當日零時。 */
export function startOfDay(instant: Date): Date {
  return fromCivil({ ...parseDateKey(toDateKey(instant)) });
}

/** 兩個日期字串相差幾天（b - a）。 */
export function diffDays(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  const ms =
    Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day);
  return Math.round(ms / 86_400_000);
}
