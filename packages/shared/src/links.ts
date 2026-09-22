/**
 * 連結型內容項目的網址正規化。
 *
 * 只接受 http 與 https。使用者貼進來的東西會被當成連結放進 DOM，
 * javascript: 與 data: 這類 scheme 一定要擋掉。
 */

/** 回傳正規化後的網址；不合法回傳 null。 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;

  // 沒寫 scheme 的補 https://，但已經有 scheme 的一律照原樣判斷。
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname === '') return null;
  return url.toString();
}
