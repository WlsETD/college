import { describe, expect, it } from 'vitest';

import {
  ORDER_STEP,
  moveItem,
  orderForAppend,
  orderForInsert,
  ordersForBatch,
  renumber,
  sortByOrder,
  type Ordered,
} from '../src/order';

const list = (...orders: number[]): Ordered[] =>
  orders.map((order, i) => ({ id: `id${i}`, order }));

describe('sortByOrder', () => {
  it('依 order 由小到大', () => {
    expect(sortByOrder(list(300, 100, 200)).map((x) => x.order)).toEqual([100, 200, 300]);
  });

  it('order 相同時用 id 當第二鍵，結果穩定', () => {
    const items = [
      { id: 'b', order: 100 },
      { id: 'a', order: 100 },
    ];
    expect(sortByOrder(items).map((x) => x.id)).toEqual(['a', 'b']);
    expect(sortByOrder(sortByOrder(items))).toEqual(sortByOrder(items));
  });

  it('不會改動原陣列', () => {
    const items = list(300, 100);
    sortByOrder(items);
    expect(items.map((x) => x.order)).toEqual([300, 100]);
  });
});

describe('orderForAppend', () => {
  it('空清單從 ORDER_STEP 開始', () => {
    expect(orderForAppend([])).toBe(ORDER_STEP);
  });

  it('接在最大值後面一個間隔', () => {
    expect(orderForAppend(list(100, 200, 300))).toBe(400);
  });

  it('看的是最大值而不是最後一個元素', () => {
    expect(orderForAppend(list(500, 100))).toBe(600);
  });

  it('負數也處理得了', () => {
    expect(orderForAppend(list(-300))).toBe(-200);
  });
});

describe('orderForInsert', () => {
  const items = list(100, 200, 300);

  it('插到最前面', () => {
    expect(orderForInsert(items, 0)).toBe(0);
  });

  it('插到最後面', () => {
    expect(orderForInsert(items, 3)).toBe(400);
  });

  it('插在中間取中點', () => {
    expect(orderForInsert(items, 1)).toBe(150);
  });

  it('空清單', () => {
    expect(orderForInsert([], 0)).toBe(ORDER_STEP);
  });

  it('index 超出範圍會被夾住', () => {
    expect(orderForInsert(items, 99)).toBe(400);
    expect(orderForInsert(items, -5)).toBe(0);
  });

  it('間隔用完時回傳 null', () => {
    expect(orderForInsert(list(100, 101), 1)).toBeNull();
  });

  it('間隔剛好 2 還塞得下', () => {
    expect(orderForInsert(list(100, 102), 1)).toBe(101);
  });

  it('連續插同一個位置，間隔會一路減半', () => {
    let items2 = list(100, 200);
    const inserted: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const order = orderForInsert(items2, 1);
      if (order === null) break;
      inserted.push(order);
      items2 = [...items2, { id: `new${i}`, order }];
    }
    expect(inserted).toEqual([150, 125, 112, 106, 103, 101]);
  });
});

describe('moveItem', () => {
  const items = list(100, 200, 300);

  it('下移會和下一個對調 order', () => {
    expect(moveItem(items, 'id0', 1)).toEqual([
      { id: 'id0', order: 200 },
      { id: 'id1', order: 100 },
    ]);
  });

  it('上移會和上一個對調 order', () => {
    expect(moveItem(items, 'id2', -1)).toEqual([
      { id: 'id2', order: 200 },
      { id: 'id1', order: 300 },
    ]);
  });

  it('已經在最上面就不動', () => {
    expect(moveItem(items, 'id0', -1)).toEqual([]);
  });

  it('已經在最下面就不動', () => {
    expect(moveItem(items, 'id2', 1)).toEqual([]);
  });

  it('找不到 id 就不動', () => {
    expect(moveItem(items, 'nope', 1)).toEqual([]);
  });

  it('移動後套用回去，順序真的換了', () => {
    const updates = moveItem(items, 'id0', 1);
    const applied = items.map((item) => updates.find((u) => u.id === item.id) ?? item);
    expect(sortByOrder(applied).map((x) => x.id)).toEqual(['id1', 'id0', 'id2']);
  });

  it('order 撞在一起時改成整串重排', () => {
    const dup = [
      { id: 'a', order: 100 },
      { id: 'b', order: 100 },
      { id: 'c', order: 300 },
    ];
    const updates = moveItem(dup, 'a', 1);
    expect(updates.length).toBeGreaterThan(0);
    const applied = dup.map((item) => updates.find((u) => u.id === item.id) ?? item);
    expect(sortByOrder(applied).map((x) => x.order)).toEqual([100, 200, 300]);
  });

  it('來回移動會回到原本的順序', () => {
    const down = moveItem(items, 'id1', 1);
    const afterDown = items.map((item) => down.find((u) => u.id === item.id) ?? item);
    const up = moveItem(afterDown, 'id1', -1);
    const afterUp = afterDown.map((item) => up.find((u) => u.id === item.id) ?? item);
    expect(sortByOrder(afterUp).map((x) => x.id)).toEqual(['id0', 'id1', 'id2']);
  });
});

describe('renumber', () => {
  it('重排成 100 的倍數', () => {
    const items = list(1, 5, 7);
    const updates = renumber(items);
    const applied = items.map((item) => updates.find((u) => u.id === item.id) ?? item);
    expect(sortByOrder(applied).map((x) => x.order)).toEqual([100, 200, 300]);
  });

  it('已經是標準編號時不產生任何更新', () => {
    expect(renumber(list(100, 200, 300))).toEqual([]);
  });

  it('只回傳真的有變的項目', () => {
    const updates = renumber(list(100, 250, 300));
    expect(updates).toEqual([{ id: 'id1', order: 200 }]);
  });

  it('空清單', () => {
    expect(renumber([])).toEqual([]);
  });

  it('重排後間隔恢復，又插得進去了', () => {
    const tight = list(100, 101);
    expect(orderForInsert(tight, 1)).toBeNull();
    const updates = renumber(tight);
    const applied = tight.map((item) => updates.find((u) => u.id === item.id) ?? item);
    expect(orderForInsert(applied, 1)).toBe(150);
  });
});

describe('ordersForBatch', () => {
  it('從現有最大值往後排', () => {
    expect(ordersForBatch(list(100, 200), 3)).toEqual([300, 400, 500]);
  });

  it('空清單從 ORDER_STEP 開始', () => {
    expect(ordersForBatch([], 3)).toEqual([100, 200, 300]);
  });

  it('count 為 0 回傳空陣列', () => {
    expect(ordersForBatch(list(100), 0)).toEqual([]);
  });

  it('批次排出來的 order 兩兩不同且遞增', () => {
    const orders = ordersForBatch(list(100), 50);
    expect(new Set(orders).size).toBe(50);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});
