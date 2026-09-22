import { describe, expect, it } from 'vitest';

import {
  OVERVIEW_WINDOW_MS,
  bucketByDue,
  chapterStates,
  chaptersMissingKeyPoints,
  flattenChapters,
  type ChapterLike,
  type ItemLike,
} from '../src/progress';

/**
 * 章 1（小節 1-1、1-2）／章 2（小節 2-1）／章 3（沒有小節）
 * order 故意亂排，確認排序真的有作用。
 */
const chapters: ChapterLike[] = [
  { id: 'c2', parentId: null, order: 200 },
  { id: 'c1', parentId: null, order: 100 },
  { id: 'c3', parentId: null, order: 300 },
  { id: 's1-2', parentId: 'c1', order: 200 },
  { id: 's1-1', parentId: 'c1', order: 100 },
  { id: 's2-1', parentId: 'c2', order: 100 },
];

const keyword = (id: string, chapterId: string | null): ItemLike => ({
  id,
  type: 'keyword',
  chapterId,
});

describe('flattenChapters', () => {
  it('章、該章的小節、下一章…', () => {
    expect(flattenChapters(chapters).map((c) => c.id)).toEqual([
      'c1',
      's1-1',
      's1-2',
      'c2',
      's2-1',
      'c3',
    ]);
  });

  it('空清單', () => {
    expect(flattenChapters([])).toEqual([]);
  });

  it('父章被刪掉的孤兒小節會被丟掉', () => {
    const orphan: ChapterLike[] = [
      { id: 'c1', parentId: null, order: 100 },
      { id: 'lost', parentId: 'gone', order: 100 },
    ];
    expect(flattenChapters(orphan).map((c) => c.id)).toEqual(['c1']);
  });

  it('不會改動原陣列', () => {
    const before = chapters.map((c) => c.id);
    flattenChapters(chapters);
    expect(chapters.map((c) => c.id)).toEqual(before);
  });
});

describe('chaptersMissingKeyPoints', () => {
  it('完全沒有關鍵字時，每一個章節都缺', () => {
    expect(chaptersMissingKeyPoints(chapters, [])).toEqual([
      'c1',
      's1-1',
      's1-2',
      'c2',
      's2-1',
      'c3',
    ]);
  });

  it('小節有關鍵字時，它自己與它所屬的章都不算缺', () => {
    const missing = chaptersMissingKeyPoints(chapters, [keyword('k1', 's1-1')]);
    expect(missing).not.toContain('s1-1');
    expect(missing).not.toContain('c1');
    expect(missing).toContain('s1-2');
  });

  it('關鍵字掛在章上，章不算缺，但小節各自還是缺', () => {
    const missing = chaptersMissingKeyPoints(chapters, [keyword('k1', 'c1')]);
    expect(missing).not.toContain('c1');
    expect(missing).toContain('s1-1');
    expect(missing).toContain('s1-2');
  });

  it('沒有小節的章，靠自己的關鍵字就夠了', () => {
    expect(chaptersMissingKeyPoints(chapters, [keyword('k1', 'c3')])).not.toContain('c3');
  });

  it('不是 keyword 型的項目不算數', () => {
    const items: ItemLike[] = [
      { id: 'h1', type: 'homework', chapterId: 's1-1' },
      { id: 'f1', type: 'file', chapterId: 's1-1' },
      { id: 'l1', type: 'link', chapterId: 's1-1' },
    ];
    expect(chaptersMissingKeyPoints(chapters, items)).toContain('s1-1');
  });

  it('沒掛章節的關鍵字不會讓任何章節脫離「缺」', () => {
    expect(chaptersMissingKeyPoints(chapters, [keyword('k1', null)])).toHaveLength(6);
  });

  it('全部都有關鍵字時回傳空陣列', () => {
    const items = ['c1', 's1-1', 's1-2', 'c2', 's2-1', 'c3'].map((id) => keyword(`k-${id}`, id));
    expect(chaptersMissingKeyPoints(chapters, items)).toEqual([]);
  });

  it('回傳的順序就是樹狀順序', () => {
    const missing = chaptersMissingKeyPoints(chapters, [keyword('k1', 's1-1')]);
    expect(missing).toEqual(['s1-2', 'c2', 's2-1', 'c3']);
  });
});

describe('chapterStates', () => {
  it('沒有設定目前進度時全部都是未開始', () => {
    const states = chapterStates(chapters, null);
    expect(Object.values(states).every((s) => s === 'todo')).toBe(true);
  });

  it('目前進度指向的 id 不存在時也是全部未開始', () => {
    const states = chapterStates(chapters, 'nope');
    expect(Object.values(states).every((s) => s === 'todo')).toBe(true);
  });

  it('目前進度在某一章上', () => {
    const states = chapterStates(chapters, 'c2');
    expect(states.c1).toBe('done');
    expect(states['s1-1']).toBe('done');
    expect(states['s1-2']).toBe('done');
    expect(states.c2).toBe('current');
    expect(states['s2-1']).toBe('todo');
    expect(states.c3).toBe('todo');
  });

  it('目前進度在小節上時，它所屬的章也算「目前」而不是「完成」', () => {
    const states = chapterStates(chapters, 's1-2');
    expect(states.c1).toBe('current');
    expect(states['s1-1']).toBe('done');
    expect(states['s1-2']).toBe('current');
    expect(states.c2).toBe('todo');
  });

  it('目前進度在第一個節點時，沒有任何東西是完成', () => {
    const states = chapterStates(chapters, 'c1');
    expect(Object.values(states).filter((s) => s === 'done')).toHaveLength(0);
  });

  it('目前進度在最後一個節點時，其餘都是完成', () => {
    const states = chapterStates(chapters, 'c3');
    expect(Object.values(states).filter((s) => s === 'todo')).toHaveLength(0);
    expect(states.c3).toBe('current');
  });
});

describe('bucketByDue', () => {
  const NOW = 1_800_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;
  const items = [
    { id: 'a', dueAt: NOW - 2 * DAY },
    { id: 'b', dueAt: NOW - 1 * DAY },
    { id: 'c', dueAt: NOW + 1 * DAY },
    { id: 'd', dueAt: NOW + 6 * DAY },
    { id: 'e', dueAt: NOW + 10 * DAY },
    { id: 'f', dueAt: null },
  ];

  it('逾期的最近的排前面', () => {
    expect(bucketByDue(items, NOW, OVERVIEW_WINDOW_MS).overdue.map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('即將到期的由近到遠，超過視窗的不算', () => {
    expect(bucketByDue(items, NOW, OVERVIEW_WINDOW_MS).upcoming.map((i) => i.id)).toEqual([
      'c',
      'd',
    ]);
  });

  it('沒有到期日的不屬於任何一堆', () => {
    const buckets = bucketByDue(items, NOW, OVERVIEW_WINDOW_MS);
    expect([...buckets.overdue, ...buckets.upcoming].map((i) => i.id)).not.toContain('f');
  });

  it('剛好在現在這一刻的算即將到期，不算逾期', () => {
    const buckets = bucketByDue([{ id: 'x', dueAt: NOW }], NOW, OVERVIEW_WINDOW_MS);
    expect(buckets.upcoming.map((i) => i.id)).toEqual(['x']);
    expect(buckets.overdue).toEqual([]);
  });

  it('剛好在視窗邊界上的算進來', () => {
    const at = NOW + OVERVIEW_WINDOW_MS;
    expect(bucketByDue([{ id: 'x', dueAt: at }], NOW, OVERVIEW_WINDOW_MS).upcoming).toHaveLength(
      1,
    );
    expect(
      bucketByDue([{ id: 'x', dueAt: at + 1 }], NOW, OVERVIEW_WINDOW_MS).upcoming,
    ).toHaveLength(0);
  });

  it('空清單', () => {
    expect(bucketByDue([], NOW, OVERVIEW_WINDOW_MS)).toEqual({ overdue: [], upcoming: [] });
  });

  it('OVERVIEW_WINDOW_MS 就是 7 天', () => {
    expect(OVERVIEW_WINDOW_MS).toBe(7 * DAY);
  });
});
