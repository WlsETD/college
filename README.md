# 進度本

大學班級共用的課程進度、作業提醒與考試重點複習工具。

> **目前進度：階段一步驟 5 / 8。**
> 專案骨架、`packages/shared` 的純函式、安全規則與權限表測試、
> Google 登入／建立群組／邀請連結／多群組切換、
> 設計 token 與 Cubic 11 子集化、外殼與底部導覽已完成。
> 架構藍圖見 [`docs/00_architecture.html`](docs/00_architecture.html)，
> 權限規格見 [`docs/01_spec_section3.md`](docs/01_spec_section3.md)。

---

## 需求

| 工具 | 版本 |
| --- | --- |
| Node.js | 20 或以上（Cloud Functions 執行環境固定 20） |
| pnpm | 10 以上 |
| Java | 11 以上（Firebase Emulator Suite 需要） |
| firebase-tools | 最新版，`npm i -g firebase-tools` |

## 安裝

```bash
pnpm install
```

第一次安裝時 pnpm 會提示有被忽略的 build script。根目錄的 `package.json` 已用
`pnpm.onlyBuiltDependencies` 放行 `esbuild` 等必要項目，不需要手動處理。

## 本機開發

### 1. 環境變數

```bash
cp .env.example apps/web/.env.local
```

填入 Firebase Console 的設定值。`.env*` 已被 `.gitignore` 排除，**任何真實金鑰都不得進版控**。

**只用 Emulator 開發時**不需要真的 Firebase 專案：把 `VITE_USE_EMULATOR` 設為 `true`、
`VITE_FIREBASE_PROJECT_ID` 設為 `demo-jindu`（要和 `pnpm emu`、規則測試用的
`--project demo-jindu` 一致），其餘欄位維持佔位值即可。

### 2. 啟動 Emulator

```bash
pnpm emu
```

啟動 Auth、Firestore、Functions、Storage 與 Emulator UI。
資料會在結束時匯出到 `.emulator-data/`，下次啟動自動匯入；要從乾淨狀態開始則用 `pnpm emu:clean`。

| 服務 | 連接埠 |
| --- | --- |
| Emulator UI | http://localhost:4000 |
| Auth | 9099 |
| Firestore | 8080 |
| Functions | 5001 |
| Storage | 9199 |
| Hosting | 5000 |

Functions 需要先打包才會被模擬器載入：

```bash
pnpm --filter @jindu/functions build
```

### 3. 啟動前端

另開一個終端機：

```bash
pnpm dev
```

開 http://localhost:5173 。

## 測試

```bash
pnpm test        # 全部
pnpm typecheck   # 型別檢查
pnpm build       # 前端 + Functions 打包
```

目前共 513 個測試：

| 套件 | 數量 | 內容 |
| --- | --- | --- |
| `packages/shared` | 115 | 時區、目錄解析、下堂課、關鍵字、假日的純函式 |
| `functions` | 61 | 邀請 token、速率限制、roles 比對的純函式 |
| `apps/web` | 22 | 設計 token、字型分片、點陣圖示的規則檢查 |
| `packages/rules-tests` | 315 | 安全規則逐格對應權限表，外加 Callable 與觸發器的整合測試 |

`packages/rules-tests` 是唯一需要 Emulator 的套件，它的 `test` script 會自己
先打包 Functions，再用 `firebase emulators:exec --project demo-jindu` 起
Auth / Firestore / Storage / Functions，跑完自動關掉。
**但它會占用 8080 / 9199 / 9099 / 5001，和 `pnpm emu` 衝突**，請先停掉再跑測試。

只想跑那一包：

```bash
pnpm --filter @jindu/rules-tests test
```

## 目錄結構

```
apps/web/            React + Vite + TypeScript，PWA。LIFF 頁面同一個 app，用路由區分
  src/lib/firebase.ts  SDK 初始化、Emulator 連線、App Check
  src/lib/auth.tsx     Google 登入與 AuthProvider
  src/lib/groups.ts    建立群組、多群組索引、邀請連結的 Callable
  src/lib/groupContext.tsx  目前群組與清單，外殼與設定頁共用
  src/components/      AppShell（頁首）、BottomNav、PixelIcon（16x16 點陣）
  src/routes/          /login、/app/*、/app/settings/invite/:gid、/join/:token
  src/styles/tokens.css     設計 token，四條硬規則寫在檔頭
  src/styles/fonts.css      由 scripts/build-fonts.mjs 產生，不要手改
  scripts/build-fonts.mjs   Cubic 11 子集化與 unicode-range 分片
  public/fonts/             分片後的 woff2 與 OFL 授權
functions/           Cloud Functions v2，TypeScript
  src/options.ts       區域與 App Check 設定（每個函式明確帶上，不用 setGlobalOptions）
  src/invites.ts       createInvite / rotateInvite / updateInviteExpiry / listInvites
                       / joinByInvite / peekInvite
  src/sync.ts          onGroupWritten：維護 userGroups 索引與離開成員的軟刪除
packages/rules-tests/ 安全規則測試（@firebase/rules-unit-testing + Emulator）
  test/firestore.group.test.ts    群組、邀請、成員
  test/firestore.content.test.ts  學期、科目、章節、內容項目、軟刪除與復原
  test/storage.test.ts            下載、上傳、30 MB、video/*、刪除物件
packages/shared/     共用型別與純函式，前端與 Functions 共用
  src/tz.ts            Asia/Taipei 固定時區工具
  src/outline.ts       目錄文字解析
  src/nextClass.ts     下堂課日期計算
  src/keywords.ts      批次關鍵字解析
  src/holidays.ts      假日清單存取
  data/holidays.json   115 學年度台灣放假日（尚未人工核對）
firestore.rules      Firestore 安全規則
storage.rules        Storage 安全規則
firestore.indexes.json
```

## 字型

介面的標題、按鈕、標籤、數字用 **Cubic 11（俐方體十一號）**，SIL OFL 授權，
授權全文在 `apps/web/public/fonts/OFL.txt`。使用者輸入的長內容與公式用 Noto Sans TC。

重新產生分片（改了介面文案之後值得跑一次，新字才會進 `ui` 那一片）：

```bash
pnpm --filter @jindu/web fonts
```

腳本會從官方 repo 的固定 tag 下載 ttf、比對 SHA-256、快取在 `apps/web/.font-cache/`
（已 gitignore），再輸出 21 片 woff2 與對應的 `@font-face`。
一般畫面只會下載 `core` + `ui` 兩片，約 47.8 KB；整份字型是 400 KB。

**像素字級只有 12 / 24 / 36px。** Cubic 11 的一個點是 100 font units、em 是 1200，
所以一個 em 裡剛好 12 個點，只有 12 的整數倍才會一個點對一個 CSS 像素。
`apps/web/test/design-tokens.test.ts` 會守住這條。

## 開發時必須記得的三件事

**一、日期一律走 `packages/shared/src/tz.ts`。**
不要使用 `Date` 的 `getHours()`、`getDate()` 這類本地時間方法，也不要假設執行環境的時區。
所有日期計算固定 Asia/Taipei。`test/tz.test.ts` 會在 `TZ=America/New_York` 下重跑一次關鍵案例來確保這點。

**二、每一個 Firestore 查詢都要帶 `where('deletedAt', '==', null)`。**
刪除一律軟刪除。安全規則無法在 list 查詢時替你過濾資料 —— 只要結果集裡可能包含
`deletedAt` 不為 null 的文件，**整個查詢就會被拒絕**，而不是把那幾筆濾掉。
因此 `firestore.indexes.json` 裡每一個複合索引都含有 `deletedAt`。

**三、App Check 的強制不寫在安全規則裡。**
`request.app` 在 Emulator 中不受支援，寫進規則會讓規則測試整批失敗。
正確做法是在 Firebase Console 對 Firestore / Storage 分別開啟 enforcement，
Cloud Functions 則用 `enforceAppCheck: true`（已設於 `functions/src/index.ts`）。

## 部署上的已知限制

Firebase CLI 至今無法正確處理 pnpm workspaces 的 symlink 相依
（firebase-tools issue [#5552](https://github.com/firebase/firebase-tools/issues/5552)、
[#5911](https://github.com/firebase/firebase-tools/issues/5911)）。
本專案的作法是用 esbuild 把 `@jindu/shared` 內聯進單一 `functions/lib/index.js`，
並產生只列外部相依的 `lib/package.json`，部署時就完全沒有 workspace 相依。
`firebase.json` 的 `predeploy` 已掛上這個打包步驟。

## 待辦

- [ ] `packages/shared/data/holidays.json` **尚未經人工核對**，且不含學校行事曆的停課日
- [x] 安全規則與權限表測試（步驟 3）
- [ ] Firebase 專案、Blaze 方案、App Check 設定（需手動操作）
- [ ] 前端 bundle 目前 694 kB（Firebase SDK 佔大宗），上線前要做 code splitting
- [ ] `fonts.css` 35 kB（gzip 13 kB），大部分是 21 片的 unicode-range 清單，可再壓
- [ ] 綠色 `#008751` 對米色底只有 4.14:1，目前規定只放白底；若要放米底需另定一個深綠
- [ ] Cubic 11 字型子集化與 unicode-range 分片（步驟 5）
