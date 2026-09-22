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
import { watchGroupDoc, watchMyGroups, type GroupDoc, type MyGroup } from './groups';
import { watchSemesters, type SemesterRow } from './semesters';

export interface GroupState {
  /** null 代表還在載入。 */
  groups: MyGroup[] | null;
  activeGid: string | null;
  /** userGroups 索引上的那一筆，只有名稱與角色。 */
  activeGroup: MyGroup | null;
  /** 群組文件本身，權限與目前學期記在這裡。 */
  groupDoc: GroupDoc | null;
  /** 目前使用者在這個群組是不是管理者（擁有者或管理者）。 */
  isManager: boolean;
  activeSemesterId: string | null;
  /** 這個群組的所有未刪除學期，新的在前。 */
  semesters: SemesterRow[] | null;
  activeSemester: SemesterRow | null;
  switchTo: (gid: string) => void;
  error: string | null;
}

const GroupContext = createContext<GroupState | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const [activeGid, setActiveGid] = useState<string | null>(() => readActiveGid());
  const [groupDoc, setGroupDoc] = useState<GroupDoc | null>(null);
  const [semesters, setSemesters] = useState<SemesterRow[] | null>(null);
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

  useEffect(() => {
    if (!uid || !activeGid) {
      setGroupDoc(null);
      setSemesters(null);
      return undefined;
    }
    const stopGroup = watchGroupDoc(activeGid, setGroupDoc, (err) => setError(err.message));
    const stopSemesters = watchSemesters(activeGid, setSemesters, (err) => setError(err.message));
    return () => {
      stopGroup();
      stopSemesters();
    };
  }, [uid, activeGid]);

  const value = useMemo<GroupState>(() => {
    const activeGroup = groups?.find((g) => g.gid === activeGid) ?? null;
    const role = uid && groupDoc ? groupDoc.roles?.[uid] : undefined;
    const activeSemesterId = groupDoc?.activeSemesterId ?? null;

    return {
      groups,
      activeGid,
      activeGroup,
      groupDoc,
      isManager: role === 'owner' || role === 'admin',
      activeSemesterId,
      semesters,
      activeSemester: semesters?.find((s) => s.id === activeSemesterId) ?? null,
      error,
      switchTo: (gid: string) => {
        writeActiveGid(gid);
        setActiveGid(gid);
      },
    };
  }, [groups, activeGid, groupDoc, semesters, uid, error]);

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
