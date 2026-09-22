import { describe, expect, it } from 'vitest';

import { diffRoles, planIsEmpty, type RoleMap } from '../src/lib/roles';

const ROLES: RoleMap = {
  owner: 'owner',
  admin: 'admin',
  viewer: 'viewer',
};

describe('diffRoles', () => {
  it('建立群組：全部算新加入', () => {
    const plan = diffRoles(null, { owner: 'owner' }, null, '資工一甲');
    expect(plan.added).toEqual([{ uid: 'owner', role: 'owner' }]);
    expect(plan.changed).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.renamed).toBe(false);
  });

  it('沒有變動時 plan 是空的', () => {
    const plan = diffRoles(ROLES, { ...ROLES }, '資工一甲', '資工一甲');
    expect(planIsEmpty(plan)).toBe(true);
  });

  it('新成員加入', () => {
    const plan = diffRoles(ROLES, { ...ROLES, newbie: 'viewer' }, '班', '班');
    expect(plan.added).toEqual([{ uid: 'newbie', role: 'viewer' }]);
    expect(plan.removed).toEqual([]);
  });

  it('指派管理者算成角色變更，不是重新加入', () => {
    const plan = diffRoles(ROLES, { ...ROLES, viewer: 'admin' }, '班', '班');
    expect(plan.changed).toEqual([{ uid: 'viewer', role: 'admin' }]);
    expect(plan.added).toEqual([]);
  });

  it('移除成員', () => {
    const { viewer: _viewer, ...rest } = ROLES;
    const plan = diffRoles(ROLES, rest, '班', '班');
    expect(plan.removed).toEqual(['viewer']);
  });

  it('轉移擁有者：兩個人都算角色變更', () => {
    const plan = diffRoles(ROLES, { ...ROLES, owner: 'admin', admin: 'owner' }, '班', '班');
    expect(plan.changed).toEqual([
      { uid: 'owner', role: 'admin' },
      { uid: 'admin', role: 'owner' },
    ]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it('群組軟刪除：傳空的 roles 進來，所有人都算被移除', () => {
    const plan = diffRoles(ROLES, {}, '班', '班');
    expect(plan.removed.sort()).toEqual(['admin', 'owner', 'viewer']);
    expect(plan.added).toEqual([]);
  });

  it('群組復原：所有人重新加入', () => {
    const plan = diffRoles({}, ROLES, '班', '班');
    expect(plan.added).toHaveLength(3);
    expect(plan.removed).toEqual([]);
  });

  it('改名會被標出來', () => {
    const plan = diffRoles(ROLES, ROLES, '資工一甲', '資工一乙');
    expect(plan.renamed).toBe(true);
    expect(planIsEmpty(plan)).toBe(false);
  });

  it('名稱傳 null 時不算改名（用來關掉 members 比對的改名邏輯）', () => {
    const plan = diffRoles(ROLES, ROLES, null, null);
    expect(plan.renamed).toBe(false);
    expect(planIsEmpty(plan)).toBe(true);
  });

  it('null 與空物件等價', () => {
    expect(diffRoles(null, null, null, null)).toEqual(diffRoles({}, {}, null, null));
  });
});
