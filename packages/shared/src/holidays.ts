/**
 * 假日清單。
 *
 * 資料放在 data/holidays.json，尚未經人工核對（verified: false）。
 * 學校行事曆的停課日（颱風假、校慶、運動會、考試週停課等）要另外補進 schoolClosures，
 * 行政院的公告裡沒有這些。
 */

import raw from '../data/holidays.json';

export type HolidayType = 'national' | 'observed' | 'weekend' | 'school';

export interface HolidayEntry {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  type: HolidayType;
}

export interface HolidayFile {
  verified: boolean;
  schoolYear: string;
  rangeStart: string;
  rangeEnd: string;
  generatedAt: string;
  sources: string[];
  holidays: HolidayEntry[];
  /** 學校自訂的停課日，由使用者維護。 */
  schoolClosures: HolidayEntry[];
}

export const holidayFile = raw as HolidayFile;

export interface HolidayQuery {
  /** 是否納入純週末的連假日，預設 false —— 週末本來就沒課，納入只是多餘。 */
  includeWeekend?: boolean;
  /** 是否納入學校停課日，預設 true。 */
  includeSchoolClosures?: boolean;
  /** 額外的停課日，例如群組自行加的。 */
  extra?: Iterable<string>;
}

/** 取得要跳過的日期字串陣列，已排序去重。 */
export function holidayDates(query: HolidayQuery = {}): string[] {
  const includeWeekend = query.includeWeekend ?? false;
  const includeSchoolClosures = query.includeSchoolClosures ?? true;

  const set = new Set<string>();
  for (const entry of holidayFile.holidays) {
    if (!includeWeekend && entry.type === 'weekend') continue;
    set.add(entry.date);
  }
  if (includeSchoolClosures) {
    for (const entry of holidayFile.schoolClosures) set.add(entry.date);
  }
  for (const date of query.extra ?? []) set.add(date);

  return [...set].sort();
}

/** 查某一天是不是假日。 */
export function isHoliday(dateKey: string, query: HolidayQuery = {}): boolean {
  return holidayDates(query).includes(dateKey);
}

/** 查某一天的假日名稱，不是假日回傳 null。 */
export function holidayName(dateKey: string): string | null {
  const hit =
    holidayFile.holidays.find((e) => e.date === dateKey) ??
    holidayFile.schoolClosures.find((e) => e.date === dateKey);
  return hit ? hit.name : null;
}
