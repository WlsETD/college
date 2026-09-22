/**
 * 前端、Functions 與安全規則共用的限制值。
 *
 * storage.rules 沒辦法 import 這個檔案，所以規則裡是另外寫死的。
 * apps/web 有一個測試會去比對兩邊的數字是否一致，改這裡記得規則也要改。
 */

/** 單檔上限 30 MB。 */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** 拒絕上傳的 contentType。 */
export const BLOCKED_CONTENT_TYPE = /^video\//i;

export type UploadRejection = 'too-large' | 'blocked-type' | 'unknown-type';

/** 上傳前先在前端擋一次，錯誤訊息比 Storage 回來的好懂。 */
export function checkUpload(file: {
  size: number;
  type: string;
}): UploadRejection | null {
  if (file.type === '') return 'unknown-type';
  if (BLOCKED_CONTENT_TYPE.test(file.type)) return 'blocked-type';
  if (file.size > MAX_UPLOAD_BYTES) return 'too-large';
  return null;
}

export const UPLOAD_REJECTION_MESSAGE: Record<UploadRejection, string> = {
  'too-large': `單檔不能超過 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
  'blocked-type': '不接受影片檔',
  'unknown-type': '認不出檔案類型，請換一個檔案',
};
