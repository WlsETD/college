/**
 * 目前群組與「我加入的群組」清單。
 *
 * 外殼的頁首、設定頁的群組清單都要用到同一份資料，所以訂閱放在 context 裡，
 * 不要每個畫面各自 onSnapshot 一次。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { readActiveGid, writeActiveGid } from './activeGroup';
import { useAuth } from './auth';
import { watchMyGroups, type MyGroup } from './groups';

export interface GroupState {
  /** null 代表還在載入。 */
  groups: MyGroup[] | null;
  activeGid: string | null;
  activeGroup: MyGroup | null;
  switchTo: (gid: string) => void;
  error: string | null;
}

const GroupContext = createContext<GroupState | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const [activeGid, setActiveGid] = useState<string | null>(() => readActiveGid());
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      setGroups(null);
      return undefined;
    }
    return watchMyGroups(
      uid,
      (rows) => {
        setGroups(rows);
        setActiveGid((current) => {
          if (current && rows.some((g) => g.gid === current)) return current;
          const fallback = rows[0]?.gid ?? null;
          writeActiveGid(fallback);
          return fallback;
        });
        setError(null);
      },
      (err) => setError(err.message),
    );
  }, [uid]);

  const value = useMemo<GroupState>(() => {
    const activeGroup = groups?.find((g) => g.gid === activeGid) ?? null;
    return {
      groups,
      activeGid,
      activeGroup,
      error,
      switchTo: (gid: string) => {
        writeActiveGid(gid);
        setActiveGid(gid);
      },
    };
  }, [groups, activeGid, error]);

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroups(): GroupState {
  const value = useContext(GroupContext);
  if (!value) throw new Error('useGroups 必須放在 <GroupProvider> 裡面');
  return value;
}

export const ROLE_LABEL: Record<string, string> = {
  owner: '擁有者',
  admin: '管理者',
  viewer: '檢視者',
};
