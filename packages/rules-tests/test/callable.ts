/**
 * 直接用 HTTP 呼叫 Functions Emulator 的 Callable。
 *
 * 為什麼不用 firebase/functions 的 httpsCallable：
 * Functions 端是 enforceAppCheck: true，「沒有帶 App Check token」一定會被拒，
 * 在 Emulator 也一樣。但 App Check 的 SDK 需要瀏覽器環境才能初始化，
 * 在 Node 測試裡跑不起來。Callable 的協定本身很單純（POST 一個 {data}），
 * 自己送就能完全控制 Authorization 與 X-Firebase-AppCheck 兩個標頭——
 * 順便也讓「沒帶 App Check 會被拒」變成可以測的案例。
 */

import { PROJECT_ID } from './helpers';

const FUNCTIONS_HOST = '127.0.0.1:5001';
const AUTH_HOST = '127.0.0.1:9099';
/** 要和 functions/src/index.ts 的 setGlobalOptions 一致。 */
const REGION = 'asia-east1';

export interface CallOptions {
  idToken?: string | null;
  /** 預設會帶一張假的 App Check token；傳 false 代表故意不帶。 */
  appCheck?: boolean;
}

export interface CallResult<T> {
  ok: boolean;
  status: number;
  result: T | null;
  errorStatus: string | null;
  errorMessage: string | null;
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * 未簽章的假 App Check token。Functions Emulator 會跳過簽章驗證
 * （FIREBASE_DEBUG_FEATURES 的 skipTokenVerification），只把 payload 解開讀 app_id。
 */
export function fakeAppCheckToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({
    app_id: `${PROJECT_ID}-test`,
    aud: [`projects/${PROJECT_ID}`],
    iat: now,
    exp: now + 3600,
    sub: '1:0:web:0',
  });
  return `${header}.${payload}.`;
}

export async function callFunction<T = unknown>(
  name: string,
  data: unknown,
  options: CallOptions = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idToken) headers.Authorization = `Bearer ${options.idToken}`;
  if (options.appCheck !== false) headers['X-Firebase-AppCheck'] = fakeAppCheckToken();

  const res = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    result?: T;
    error?: { status?: string; message?: string };
  };

  return {
    ok: res.ok && body.error === undefined,
    status: res.status,
    result: body.result ?? null,
    errorStatus: body.error?.status ?? null,
    errorMessage: body.error?.message ?? null,
  };
}

export interface TestUser {
  uid: string;
  idToken: string;
  email: string;
}

/**
 * 在 Auth Emulator 建一個帳號並取得 ID token。
 * Emulator 不檢查 API key，隨便一個字串都行。
 */
export async function createTestUser(email: string, displayName = email): Promise<TestUser> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', returnSecureToken: true, displayName }),
    },
  );

  if (!res.ok) {
    throw new Error(`建立測試帳號失敗：${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { idToken: string; localId: string };
  return { uid: body.localId, idToken: body.idToken, email };
}

/** 清掉 Auth Emulator 裡的所有帳號。 */
export async function clearAuth(): Promise<void> {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
}

/** 觸發器是非同步的，輪詢等它把資料寫好。 */
export async function waitFor<T>(
  probe: () => Promise<T | null>,
  label: string,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== null && value !== undefined) return value;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`等待「${label}」逾時${lastError ? `：${String(lastError)}` : ''}`);
}
