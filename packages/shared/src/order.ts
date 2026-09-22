/**
 * 排序用的 order 欄位計算。
 *
 * order 以 100 為間隔（決策：2026-09-22），之後在中間插入不必把整串重排。
 * 這裡全部是純函式，UI 只負責把算出來的結果寫回 Firestore。
 */

export const ORDER_STEP = 100;

export interface Ordered {
  id: string;
  order: number;
}

/** 依 order 排序；order 相同時用 id 當穩定的第二鍵。 */
export function sortByOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** 接在最後面。空清單從 ORDER_STEP 開始。 */
export function orderForAppend(items: readonly Ordered[]): number {
  if (items.length === 0) return ORDER_STEP;
  const max = items.reduce((acc, item) => Math.max(acc, item.order), Number.NEGATIVE_INFINITY);
  return max + ORDER_STEP;
}

/**
 * 插到第 index 個位置（0 代表最前面，items.length 代表最後面）。
 *
 * 回傳 null 代表前後兩個 order 之間已經擠不下整數，呼叫端要先 renumber()
 * 再重試。實務上要連續插入約一百次才會遇到。
 */
export function orderForInsert(items: readonly Ordered[], index: number): number | null {
  const sorted = sortByOrder(items);
  const clamped = Math.max(0, Math.min(index, sorted.length));

  const before = clamped === 0 ? null : (sorted[clamped - 1] as Ordered).order;
  const after = clamped === sorted.length ? null : (sorted[clamped] as Ordered).order;

  if (before === null && after === null) return ORDER_STEP;
  if (before === null) return (after as number) - ORDER_STEP;
  if (after === null) return before + ORDER_STEP;

  const gap = after - before;
  if (gap <= 1) return null;
  return before + Math.floor(gap / 2);
}

/**
 * 上移或下移一格。
 *
 * 做法是把自己和鄰居的 order 對調——固定兩筆寫入，不會用光間隔，
 * 也不必整串重排。已經在頭／尾時回傳空陣列。
 */
export function moveItem(
  items: readonly Ordered[],
  id: string,
  direction: -1 | 1,
): Ordered[] {
  const sorted = sortByOrder(items);
  const index = sorted.findIndex((item) => item.id === id);
  if (index < 0) return [];

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= sorted.length) return [];

  const self = sorted[index] as Ordered;
  const other = sorted[targetIndex] as Ordered;

  // order 撞在一起時對調沒有意義，整串重排比較保險。
  if (self.order === other.order) return renumber(sorted);

  return [
    { id: self.id, order: other.order },
    { id: other.id, order: self.order },
  ];
}

/** 依目前順序重新編號成 100、200、300…，只回傳真的變動的項目。 */
export function renumber(items: readonly Ordered[]): Ordered[] {
  return sortByOrder(items)
    .map((item, index) => ({ id: item.id, order: (index + 1) * ORDER_STEP }))
    .filter((next, index) => {
      const current = sortByOrder(items)[index] as Ordered;
      return current.order !== next.order;
    });
}

/**
 * 一次排好一整串新項目的 order（例如精靈批次建立章節）。
 * 回傳長度與 count 相同的 order 陣列。
 */
export function ordersForBatch(existing: readonly Ordered[], count: number): number[] {
  const start = orderForAppend(existing);
  return Array.from({ length: count }, (_, i) => start + i * ORDER_STEP);
}
