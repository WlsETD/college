/**
 * 顯示用的日期時間格式化。
 *
 * 一律走 @jindu/shared 的 tz.ts，固定 Asia/Taipei。不要用 Date 的
 * getHours() / getDate()，那是瀏覽器所在時區。
 */

import { atTaipei, diffDays, toCivil, toDateKey, weekdayOf } from '@jindu/shared';

const WEEKDAY_LABEL = ['', '一', '二', '三', '四', '五', '六', '日'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 例：09/25 (五) 23:59 */
export function formatDueAt(millis: number): string {
  const date = new Date(millis);
  const civil = toCivil(date);
  const weekday = WEEKDAY_LABEL[weekdayOf(toDateKey(date))] ?? '';
  return `${pad2(civil.month)}/${pad2(civil.day)} (${weekday}) ${pad2(civil.hour)}:${pad2(
    civil.minute,
  )}`;
}

/** 距離今天還有幾天。負數代表已經過期。 */
export function daysUntil(millis: number, now = new Date()): number {
  return diffDays(toDateKey(now), toDateKey(new Date(millis)));
}

/** 例：D-3、今天、已逾期 2 天 */
export function describeDue(millis: number, now = new Date()): string {
  const days = daysUntil(millis, now);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  return `D-${days}`;
}

/** <input type="datetime-local"> 需要的 YYYY-MM-DDTHH:mm（台北時間）。 */
export function toDatetimeLocal(millis: number): string {
  const civil = toCivil(new Date(millis));
  return `${civil.year}-${pad2(civil.month)}-${pad2(civil.day)}T${pad2(civil.hour)}:${pad2(
    civil.minute,
  )}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 把 <input type="datetime-local"> 的值當成台北時間解回毫秒。
 *
 * 瀏覽器給的是不帶時區的字串，直接 new Date() 會用使用者所在時區解讀——
 * 在國外用這個 app 的話作業到期日就會偏掉。
 */
export function fromDatetimeLocal(value: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
  if (!m) return null;
  try {
    return atTaipei(m[1] as string, m[2] as string).getTime();
  } catch {
    return null;
  }
}
