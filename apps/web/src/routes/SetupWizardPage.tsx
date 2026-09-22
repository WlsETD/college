/**
 * 開學設定精靈，三個步驟（架構圖「04 開學設定精靈」）：
 *   1. 新增科目：名稱、3 字以內簡稱、12 色選一、上課時間
 *   2. 貼上目錄 → parseOutline() 即時預覽 → 確認後 writeBatch 一次建立章節
 *   3. 複製邀請連結
 *
 * 解析是 @jindu/shared 的純函式，所有格式變化都在 Vitest 裡測過，
 * 這裡只負責把結果顯示出來讓人確認。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { parseOutline } from '@jindu/shared';
import SubjectForm from '../components/SubjectForm';
import { createChaptersFromOutline } from '../lib/chapters';
import { useGroups } from '../lib/groupContext';
import { callCreateInvite, inviteLink, type IssuedInvite } from '../lib/groups';
import { createSubject, watchSubjects, type SubjectInput, type SubjectRow } from '../lib/subjects';
import { describeCallableError } from './InvitePage';

const STEPS = ['新增科目', '貼上目錄', '邀請同學'] as const;

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const { activeGid, activeSemesterId, activeSemester, isManager } = useGroups();

  const [step, setStep] = useState(0);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [existing, setExisting] = useState<SubjectRow[]>([]);
  const [outlineText, setOutlineText] = useState('');
  const [created, setCreated] = useState<number | null>(null);
  const [invite, setInvite] = useState<IssuedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 現有科目只用來算新科目的 order。
  useEffect(() => {
    if (!activeGid || !activeSemesterId) return undefined;
    return watchSubjects(activeGid, activeSemesterId, setExisting, (err) => setError(err.message));
  }, [activeGid, activeSemesterId]);

  const outline = useMemo(() => parseOutline(outlineText), [outlineText]);

  if (!activeGid) return <p className="hint">請先選一個群組。</p>;

  if (!isManager) {
    return (
      <section>
        <h1>開學設定</h1>
        <p className="hint">只有擁有者與管理者可以設定科目與章節。</p>
        <Link className="btn" to="/app/overview">
          回總覽
        </Link>
      </section>
    );
  }

  if (!activeSemesterId) {
    return (
      <section>
        <h1>開學設定</h1>
        <div className="panel">
          <h2>先建立學期</h2>
          <p className="hint">科目與章節都掛在學期底下。</p>
          <Link className="btn" to="/app/settings">
            去設定學期
          </Link>
        </div>
      </section>
    );
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubject(input: SubjectInput) {
    await run(async () => {
      const id = await createSubject(activeGid!, activeSemesterId!, input, existing);
      setSubject({ id, name: input.name });
      setStep(1);
    });
  }

  async function handleOutline() {
    if (!subject) return;
    await run(async () => {
      const count = await createChaptersFromOutline(
        activeGid!,
        activeSemesterId!,
        subject.id,
        outline,
        [],
      );
      setCreated(count);
      setStep(2);
    });
  }

  async function handleInvite() {
    setBusy(true);
    setError(null);
    try {
      const res = await callCreateInvite({ gid: activeGid!, expiresAt: null });
      setInvite(res.data);
    } catch (err) {
      setError(describeCallableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">開學設定精靈</p>
      <h1>{STEPS[step]}</h1>

      {/* 進度：數字 + 填滿的方塊，不只靠顏色。 */}
      <ol className="steps" aria-label="設定進度">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index === step ? 'step step-on' : index < step ? 'step step-done' : 'step'}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className="step-mark" aria-hidden="true">
              {index < step ? '✓' : index + 1}
            </span>
            <span className="nav-label">{label}</span>
          </li>
        ))}
      </ol>

      <p className="hint">{activeSemester ? `${activeSemester.name} 學期` : ''}</p>

      {error ? <p className="error">▲ {error}</p> : null}

      {step === 0 ? (
        <>
          <p className="hint">先建一個科目。之後可以在「設定 → 科目」再加其他科目。</p>
          <SubjectForm submitLabel="下一步" busy={busy} onSubmit={handleSubject} />
        </>
      ) : null}

      {step === 1 && subject ? (
        <>
          <p className="hint">
            把課本目錄或教學大綱整段貼進來，下面會即時顯示解析結果。
            「第一章」「第1章」「Chapter 1」「1-1」「1.1」「§1.1」都認得，
            頁碼與點線會自動去掉。
          </p>

          <label className="field">
            <span>{subject.name} 的目錄</span>
            <textarea
              value={outlineText}
              onChange={(e) => setOutlineText(e.target.value)}
              rows={10}
              placeholder={'第一章 極限\n  1-1 數列極限\n  1-2 連續\n第二章 微分\n  2-1 導數定義'}
            />
          </label>

          <div className="panel">
            <h2>預覽</h2>
            {outline.nodeCount === 0 ? (
              <p className="hint">還沒有解析到任何章節。</p>
            ) : (
              <>
                <p className="hint">會建立 {outline.nodeCount} 個節點。</p>
                <ul className="tree">
                  {outline.chapters.map((chapter, ci) => (
                    <li key={`${chapter.number ?? 'x'}-${ci}`}>
                      <div className="card">
                        <div className="card-main">
                          {chapter.number ? <span className="tag">{chapter.number}</span> : null}
                          <strong>{chapter.title || chapter.raw || `第 ${ci + 1} 章`}</strong>
                          {chapter.implicit ? <span className="tag">目錄沒寫，自動補的</span> : null}
                        </div>
                      </div>
                      <ul className="tree tree-sections">
                        {chapter.sections.map((section, si) => (
                          <li key={`${section.number ?? 'x'}-${si}`}>
                            <div className="card">
                              <div className="card-main">
                                {section.number ? (
                                  <span className="tag">{section.number}</span>
                                ) : null}
                                <span>{section.title || section.raw}</span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="choices">
            <button
              type="button"
              className="btn"
              disabled={busy || outline.nodeCount === 0}
              onClick={() => void handleOutline()}
            >
              建立 {outline.nodeCount} 個節點
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setStep(2)}>
              先跳過
            </button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          {created !== null ? <p className="hint">已建立 {created} 個章節節點。</p> : null}

          <div className="panel">
            <h2>邀請同學</h2>
            <p className="hint">用連結加入的人預設是檢視者，只能看不能改。</p>

            {invite ? (
              <>
                <p className="hint">
                  ▲ 這串連結只會顯示這一次。Firestore 只存雜湊，關掉就要重新產生。
                </p>
                <code className="token">{inviteLink(invite.token)}</code>
                <div className="choices">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(inviteLink(invite.token))
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false));
                    }}
                  >
                    {copied ? '已複製 ✓' : '複製'}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void handleInvite()}
              >
                產生邀請連結
              </button>
            )}
          </div>

          <div className="choices">
            <button
              type="button"
              className="btn"
              onClick={() => navigate('/app/settings/subjects')}
            >
              完成，去看科目
            </button>
          </div>
        </>
      ) : null}

      {step > 0 ? (
        <button type="button" className="btn btn-plain" onClick={() => setStep(step - 1)}>
          ← 上一步
        </button>
      ) : null}
    </section>
  );
}
