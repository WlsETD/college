import { describe, expect, it } from 'vitest';

import { filterEnrolled } from '../src/enrollment';

const subjects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('filterEnrolled', () => {
  it('依清單過濾', () => {
    expect(filterEnrolled(subjects, ['a', 'c'])).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('空清單代表還沒選過，回傳全部', () => {
    expect(filterEnrolled(subjects, [])).toEqual(subjects);
  });

  it('null 與 undefined 同樣回傳全部', () => {
    expect(filterEnrolled(subjects, null)).toEqual(subjects);
    expect(filterEnrolled(subjects, undefined)).toEqual(subjects);
  });

  it('清單裡有不存在的 id 不會出錯', () => {
    expect(filterEnrolled(subjects, ['a', 'nope'])).toEqual([{ id: 'a' }]);
  });

  it('全部都選', () => {
    expect(filterEnrolled(subjects, ['a', 'b', 'c'])).toEqual(subjects);
  });

  it('維持原本的順序，不照清單的順序', () => {
    expect(filterEnrolled(subjects, ['c', 'a']).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('不會改動原陣列', () => {
    const copy = [...subjects];
    filterEnrolled(subjects, []);
    expect(subjects).toEqual(copy);
  });
});
