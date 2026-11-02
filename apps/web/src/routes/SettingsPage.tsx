import { useState } from 'react';
import { Link } from 'react-router-dom';

import SemesterSection from '../components/SemesterSection';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL, useGroups } from '../lib/groupContext';
import { createGroup } from '../lib/groups';

export default function SettingsPage() {
  const { user, signOutNow } = useAuth();
  const { groups, activeGid, switchTo, isManager, error: groupError } = useGroups();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!user || name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const gid = await createGroup(name, {
        uid: user.uid,
        displayName: user.displayName ?? '未命名',
        photoURL: user.photoURL ?? null,
      });
      switchTo(gid);
      setName('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>設定</h1>

      {groupError ? <p className="error">{groupError}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="panel">
        <h2>帳號</h2>
        <p className="hint">{user?.displayName ?? user?.email ?? '（未命名）'}</p>
        <button type="button" className="btn" onClick={() => void signOutNow()}>
          登出
        </button>
      </div>

      {activeGid ? (
        <>
          <SemesterSection />

          <div className="panel">
            <h2>課程內容</h2>
            <div className="choices">
              <Link className="btn" to="/app/settings/subjects">
                科目與章節
              </Link>
              <Link className="btn" to="/app/settings/enrollment">
                我修的科目
              </Link>
              {isManager ? (
                <Link className="btn" to="/app/setup">
                  開學設定精靈
                </Link>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <h2>我的群組</h2>

      {groups === null ? <p className="hint">載入中…</p> : null}

      {groups !== null && groups.length === 0 ? (
        <p className="hint">還沒有加入任何群組。建立一個新的，或請同學把邀請連結給你。</p>
      ) : null}

      {groups !== null && groups.length > 0 ? (
        <ul className="card-list">
          {groups.map((group) => {
            const active = group.gid === activeGid;
            return (
              <li key={group.gid} className={active ? 'card card-active' : 'card'}>
                <div className="card-main">
                  <strong>{group.groupName}</strong>
                  <span className="tag">{ROLE_LABEL[group.role] ?? group.role}</span>
                  {active ? <span className="tag tag-active">● 目前</span> : null}
                </div>
                <div className="card-actions">
                  {active ? null : (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => switchTo(group.gid)}
                    >
                      切換
                    </button>
                  )}
                  {group.role === 'viewer' ? null : (
                    <Link className="btn" to={`/app/settings/invite/${group.gid}`}>
                      邀請連結 / 成員
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form className="panel" onSubmit={handleCreate}>
        <h2>建立群組</h2>
        <p className="hint">建立者會成為擁有者。</p>
        <label className="field">
          <span>群組名稱</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：資工一甲"
            maxLength={30}
            required
          />
        </label>
        <button type="submit" className="btn" disabled={busy || name.trim() === ''}>
          {busy ? '建立中…' : '建立'}
        </button>
        <p className="hint">建立後群組會晚一兩秒才出現在清單上——索引由 Cloud Function 維護。</p>
      </form>
    </section>
  );
}
