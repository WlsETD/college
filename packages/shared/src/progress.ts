/**
 * 進度頁與總覽頁的計算。
 *
 * 全部是純函式，Firestore 的資料形狀只透過下面兩個最小介面進來，
 * 這樣格式變化都能在 Vitest 裡測，不必開 Emulator。
 */

import { sortByOrder, type Ordered } from './order';

/** 章節樹的節點。章的 parentId 為 null。 */
export interface ChapterLike extends Ordered {
  parentId: string | null;
}

/** 內容項目。只看得到型別與掛在哪個章節。 */
export interface ItemLike {
  id: string;
  type: string;
  chapterId: string | null;
}

/**
 * 依樹狀順序攤平：章、該章的小節、下一章…
 * 孤兒小節（父章已被刪）會被丟掉——它在樹上本來就顯示不出來。
 */
export function flattenChapters<T extends ChapterLike>(chapters: readonly T[]): T[] {
  const roots = sortByOrder(chapters.filter((c) => c.parentId === null));
  const out: T[] = [];
  for (const root of roots) {
    out.push(root);
    for (const section of sortByOrder(chapters.filter((c) => c.parentId === root.id))) {
      out.push(section);
    }
  }
  return out;
}

/**
 * 缺重點的章節。
 *
 * 定義（決策：2026-09-22）：該章節底下沒有任何 type === 'keyword' 的未刪除項目。
 * 「底下」對章來說包含它的小節——整章連一個重點都沒有才算缺；
 * 對小節來說就是它自己。
 *
 * 傳進來的 items 必須是已經濾掉 deletedAt 的。
 */
export function chaptersMissingKeyPoints(
  chapters: readonly ChapterLike[],
  items: readonly ItemLike[],
): string[] {
  const withKeyword = new Set(
    items.filter((item) => item.type === 'keyword' && item.chapterId !== null).map((item) => item.chapterId as string),
  );

  const missing: string[] = [];
  for (const chapter of flattenChapters(chapters)) {
    if (chapter.parentId !== null) {
      if (!withKeyword.has(chapter.id)) missing.push(chapter.id);
      continue;
    }
    const sections = chapters.filter((c) => c.parentId === chapter.id);
    const covered =
      withKeyword.has(chapter.id) || sections.some((section) => withKeyword.has(section.id));
    if (!covered) missing.push(chapter.id);
  }
  return missing;
}

export type ChapterState = 'done' | 'current' | 'todo';

/**
 * 每個章節相對於「目前進度」的狀態。
 *
 * 目前進度之前的算完成、之後的算未開始。如果目前進度指在某個小節上，
 * 它所屬的那一章也算「目前」而不是「完成」——那一章顯然還在上。
 */
export function chapterStates(
  chapters: readonly ChapterLike[],
  currentChapterId: string | null,
): Record<string, ChapterState> {
  const flat = flattenChapters(chapters);
  const states: Record<string, ChapterState> = {};

  const index = currentChapterId === null ? -1 : flat.findIndex((c) => c.id === currentChapterId);
  if (index < 0) {
    for (const chapter of flat) states[chapter.id] = 'todo';
    return states;
  }

  flat.forEach((chapter, i) => {
    states[chapter.id] = i < index ? 'done' : i === index ? 'current' : 'todo';
  });

  const current = flat[index] as ChapterLike;
  if (current.parentId !== null) {
    states[current.parentId] = 'current';
  }
  return states;
}

// -----------------------------------------------------------------------------
// 總覽：7 天內到期的作業
// -----------------------------------------------------------------------------

export interface DueLike {
  id: string;
  dueAt: number | null;
}

export interface DueBuckets<T> {
  /** 已經過了期限的，最近的排前面。 */
  overdue: T[];
  /** 從現在到 withinMs 之後，依到期時間由近到遠。 */
  upcoming: T[];
}

/**
 * 把作業分成已逾期與即將到期兩堆。
 *
 * 沒有到期日的不屬於任何一堆——總覽只回答「什麼時候要交」。
 */
export function bucketByDue<T extends DueLike>(
  items: readonly T[],
  now: number,
  withinMs: number,
): DueBuckets<T> {
  const dated = items.filter((item) => item.dueAt !== null);
  const byDue = [...dated].sort((a, b) => (a.dueAt as number) - (b.dueAt as number));

  return {
    overdue: byDue.filter((item) => (item.dueAt as number) < now).reverse(),
    upcoming: byDue.filter(
      (item) => (item.dueAt as number) >= now && (item.dueAt as number) <= now + withinMs,
    ),
  };
}

/** 總覽的預設範圍：7 天。 */
export const OVERVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
