/**
 * 內容項目：作業、關鍵字、檔案、連結四型共用一個集合。
 *
 * gid / semId / subId 是為了 collection group 查詢（總覽頁的 7 天內作業）
 * 反正規化上去的，安全規則會檢查它們和實際路徑一致，寫入時不能亂填。
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  UPLOAD_REJECTION_MESSAGE,
  checkUpload,
  normalizeUrl,
  parseKeywords,
  type Item,
  type ItemType,
} from '@jindu/shared';

import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  docConverter,
  softDeleteFields,
} from './converters';
import { db, storage } from './firebase';

export type ItemRow = Item;

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  homework: '作業',
  keyword: '關鍵字',
  file: '檔案',
  link: '連結',
};

function itemsPath(gid: string, semId: string, subId: string): string {
  return `groups/${gid}/semesters/${semId}/subjects/${subId}/items`;
}

export function watchItems(
  gid: string,
  semId: string,
  subId: string,
  onChange: (rows: ItemRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, itemsPath(gid, semId, subId)).withConverter(docConverter<ItemRow>()),
    where('deletedAt', '==', null),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data());
      // 新的排前面；作業另外依到期日排，留給頁面自己處理。
      rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      onChange(rows);
    },
    onError,
  );
}

export interface ItemContext {
  gid: string;
  semId: string;
  subId: string;
  uid: string;
  /** 掛在哪個章節底下，可為 null。 */
  chapterId: string | null;
}

function baseFields(ctx: ItemContext, type: ItemType) {
  return {
    ...auditFieldsForCreate(),
    type,
    chapterId: ctx.chapterId,
    createdBy: ctx.uid,
    gid: ctx.gid,
    semId: ctx.semId,
    subId: ctx.subId,
  };
}

// -----------------------------------------------------------------------------
// 作業
// -----------------------------------------------------------------------------

export async function createHomework(
  ctx: ItemContext,
  input: { title: string; body?: string; dueAt: number | null },
): Promise<string> {
  const ref_ = doc(collection(db, itemsPath(ctx.gid, ctx.semId, ctx.subId)));
  await setDoc(ref_, {
    ...baseFields(ctx, 'homework'),
    title: input.title.trim(),
    body: input.body?.trim() ?? '',
    dueAt: input.dueAt,
  });
  return ref_.id;
}

// -----------------------------------------------------------------------------
// 關鍵字（可批次）
// -----------------------------------------------------------------------------

export async function createKeyword(
  ctx: ItemContext,
  input: { title: string; body: string },
): Promise<string> {
  const ref_ = doc(collection(db, itemsPath(ctx.gid, ctx.semId, ctx.subId)));
  await setDoc(ref_, {
    ...baseFields(ctx, 'keyword'),
    title: input.title.trim(),
    body: input.body,
    dueAt: null,
  });
  return ref_.id;
}

/**
 * 批次貼上關鍵字。解析是 @jindu/shared 的純函式，這裡只負責寫入。
 * 一次最多 450 筆，超過分批送（Firestore batch 上限 500）。
 */
const BATCH_LIMIT = 450;

export async function createKeywordsFromText(ctx: ItemContext, text: string): Promise<number> {
  const parsed = parseKeywords(text);
  if (parsed.length === 0) return 0;

  const path = itemsPath(ctx.gid, ctx.semId, ctx.subId);
  for (let i = 0; i < parsed.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const keyword of parsed.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(collection(db, path)), {
        ...baseFields(ctx, 'keyword'),
        title: keyword.term,
        body: keyword.description,
        dueAt: null,
      });
    }
    await batch.commit();
  }
  return parsed.length;
}

// -----------------------------------------------------------------------------
// 連結
// -----------------------------------------------------------------------------

export async function createLink(
  ctx: ItemContext,
  input: { title: string; url: string },
): Promise<string> {
  const url = normalizeUrl(input.url);
  if (url === null) throw new Error('網址格式不正確，只接受 http 或 https');

  const ref_ = doc(collection(db, itemsPath(ctx.gid, ctx.semId, ctx.subId)));
  await setDoc(ref_, {
    ...baseFields(ctx, 'link'),
    title: input.title.trim() || url,
    body: '',
    dueAt: null,
    url,
  });
  return ref_.id;
}

// -----------------------------------------------------------------------------
// 檔案
// -----------------------------------------------------------------------------

/** Storage 的路徑慣例：groups/{gid}/... ，規則只讓該群組的管理者寫。 */
function storagePathFor(ctx: ItemContext, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-一-鿿]/g, '_').slice(-80);
  const stamp = Date.now().toString(36);
  return `groups/${ctx.gid}/${ctx.semId}/${ctx.subId}/${stamp}_${safe}`;
}

export async function createFileItem(
  ctx: ItemContext,
  file: File,
  title?: string,
): Promise<string> {
  // 先在前端擋一次，錯誤訊息比 Storage 回來的 storage/unauthorized 好懂。
  const rejection = checkUpload(file);
  if (rejection) throw new Error(UPLOAD_REJECTION_MESSAGE[rejection]);

  const path = storagePathFor(ctx, file.name);
  await uploadBytes(ref(storage, path), file, { contentType: file.type });

  const ref_ = doc(collection(db, itemsPath(ctx.gid, ctx.semId, ctx.subId)));
  await setDoc(ref_, {
    ...baseFields(ctx, 'file'),
    title: (title ?? file.name).trim(),
    body: '',
    dueAt: null,
    storagePath: path,
    contentType: file.type,
    sizeBytes: file.size,
  });
  return ref_.id;
}

export async function fileUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

// -----------------------------------------------------------------------------
// 編輯與刪除
// -----------------------------------------------------------------------------

export async function updateItem(
  gid: string,
  semId: string,
  subId: string,
  itemId: string,
  patch: { title?: string; body?: string; dueAt?: number | null; chapterId?: string | null },
): Promise<void> {
  const clean: Record<string, unknown> = { ...auditFieldsForUpdate() };
  if (patch.title !== undefined) clean.title = patch.title.trim();
  if (patch.body !== undefined) clean.body = patch.body;
  if (patch.dueAt !== undefined) clean.dueAt = patch.dueAt;
  if (patch.chapterId !== undefined) clean.chapterId = patch.chapterId;

  await updateDoc(doc(db, `${itemsPath(gid, semId, subId)}/${itemId}`), clean);
}

/**
 * 軟刪除。檔案型的實體物件留在 Storage——規則禁止刪除物件，
 * 孤兒檔由階段二的排程 Function 清理（見規格第 3.3 節）。
 */
export async function softDeleteItem(
  gid: string,
  semId: string,
  subId: string,
  itemId: string,
): Promise<void> {
  await updateDoc(doc(db, `${itemsPath(gid, semId, subId)}/${itemId}`), softDeleteFields());
}
