# 進度本 — 專案脈絡

大學班級共用的課程進度、作業提醒與考試重點複習工具。
回覆一律使用繁體中文，git commit 訊息也是。

---

## 目前進度：階段一，步驟 2 / 8 已完成

```
882349a 實作 packages/shared 的共用純函式與單元測試   ← 步驟 2
0401725 建立 Monorepo 骨架與開發環境                  ← 步驟 1
```

驗證狀態：`pnpm test` 115 個測試全過、`pnpm typecheck` 通過、`pnpm build` 通過。

---

## 工作方式（使用者指定，請遵守）

1. **規格書已確定的決策不要自行更改。** 認為有問題就先提出來討論，不要直接改。
2. **每完成一個步驟：跑測試 → 確認通過 → git commit（繁體中文訊息）→ 簡短回報 → 等使用者說繼續。** 不要一口氣做完多個步驟。
3. **遇到規格沒寫清楚的地方，列出選項和建議讓使用者決定，不要自行假設。**
4. **需要使用者手動操作的事（建立 Firebase 專案、升級 Blaze、設定 App Check、取得金鑰等）列成清單告訴他，不要跳過。**
5. **不要把任何金鑰或憑證寫進程式碼或 commit。** 用環境變數與 `.env.example`。

---

## 開發順序（8 步）

| # | 內容 | 狀態 |
| --- | --- | --- |
| 1 | pnpm workspaces 骨架、TS/Vitest、Emulator 設定、`.env.example`、README | ✅ 完成 |
| 2 | `packages/shared` 純函式 + 單元測試 | ✅ 完成 |
| 3 | Firestore 資料模型 + `firestore.rules` + `storage.rules` + 權限表逐格測試 | ← 下一步 |
| 4 | Google 登入、建立群組、邀請連結（`joinByInvite` / `rotateInvite`）、多群組切換 | |
| 5 | 設計 token、Cubic 11 子集化、外殼與底部導覽 | |
| 6 | 學期、科目、章節樹 CRUD 排序、開學設定精靈三步驟 | |
| 7 | 我修的科目、內容項目四型（作業快速日期、關鍵字批次、檔案、連結） | |
| 8 | 總覽／作業／筆記／進度四頁、缺重點標示、Emulator 全流程走查 | |

階段二（**本次不做**）：考試、閃卡、LINE / LIFF、推播通知、AI 產生重點。
資料結構有預留位置，但不實作。

---

## 從第一行程式碼就必須做到

1. 所有日期計算與排程固定 **Asia/Taipei**，不依賴伺服器或瀏覽器的預設時區。
2. 啟用 **Firebase App Check**。
3. Security Rules 依 `groups/{gid}.roles` 判斷權限，權限表的**每個角色每個動作**都要有「允許」或「拒絕」的測試案例。
4. **刪除一律軟刪除**（寫入 `deletedAt`），查詢時排除。
5. Storage 規則限制單檔 **30 MB**、拒絕 **video/\***、只有該群組的管理者能寫入。

---

## 三個最容易踩到的坑

**一、日期一律走 `packages/shared/src/tz.ts`。**
不要用 `Date` 的 `getHours()` / `getDate()` 這類本地時間方法，也不要假設執行環境時區。
`test/tz.test.ts` 會在 `TZ=America/New_York` 下重跑關鍵案例來守住這條規則。

**二、每一個 Firestore 查詢都要帶 `where('deletedAt', '==', null)`。**
安全規則**無法**在 list 查詢時替你過濾資料。只要結果集裡可能包含 `deletedAt` 不為 null 的文件，
**整個查詢就會被拒絕**，而不是把那幾筆濾掉。`firestore.indexes.json` 裡每個複合索引都已含 `deletedAt`。

**三、App Check 的強制不寫在安全規則裡。**
`request.app` 在 Emulator 中不受支援，寫進規則會讓規則測試整批失敗。
正確做法是在 Firebase Console 對 Firestore / Storage 分別開啟 enforcement，
Cloud Functions 用 `enforceAppCheck: true`（已設於 `functions/src/index.ts`）。

---

## 已定案的技術決策

| 決策 | 內容 | 理由 |
| --- | --- | --- |
| 時區實作 | `tz.ts` 自製，用 `Intl.DateTimeFormat`，零相依 | 只需單一固定時區，不值得為此把 tz database 塞進兩個 bundle |
| Functions 打包 | esbuild 打成單一 `lib/index.js`，自動產生只列外部相依的 `lib/package.json` | Firebase CLI 無法處理 pnpm workspace 的 symlink 相依（firebase-tools [#5552](https://github.com/firebase/firebase-tools/issues/5552)、[#5911](https://github.com/firebase/firebase-tools/issues/5911)） |
| 章節樹層數 | 固定兩層（章／小節）。三層以上的編號壓成小節編號如 `1-1-2` | 目錄解析的自然輸出就是兩層 |
| 缺重點定義 | 該章節底下沒有任何 `type === 'keyword'` 的未刪除項目 | |
| 檢視者可見範圍 | Rules 讓檢視者讀得到全群組資料，只在前端依「我修的科目」過濾 | 逐科目檢查 `enrolledSubjectIds` 會讓讀取成本與規則複雜度大幅上升 |
| 邀請加入 | 一定要走 Cloud Function（Admin SDK） | 非成員無法通過 Rules 寫 `groups/{gid}.roles` |
| items 反正規化 | `items` 存 `gid` / `semId` / `subId` | 總覽頁要用 collection group 查 7 天內作業 |
| `order` 間隔 | 以 100 為間隔 | 之後插入不必重排全部 |
| 邀請 token | 只存 SHA-256 hash，token ≥ 128 bit，Functions 端加速率限制 | 明碼只出現在連結裡 |
| KaTeX | 必須設 `trust: false`、`strict: 'warn'` | 說明欄是使用者輸入，`\href` 可塞 `javascript:` |
| `.npmrc` | 不使用。`onlyBuiltDependencies` 寫在 `package.json` | |

---

## 尚未拍板的事項

**進入步驟 3 之前必須先問使用者：**

1. **規格書第 3 節的完整權限表。** 目前只有依三角色（owner / admin / viewer）推得的版本。
   要寫出「每個角色每個動作」的測試，需要原始權限表的每一列，
   例如檢視者能不能上傳檔案、管理者能不能刪學期。

**進入步驟 5 之前必須先問使用者：**

2. **規格書第 7 節的配色。** 目前只確定放文字的綠色 `#008751`、紅色 `#C4003B`。
   科目 12 色是提案版本，待確認。
3. **要不要做深色模式。** `#008751` 在深色底無法達 WCAG AA，
   若要支援需另定一組深色專用的綠／紅。
4. **Cubic 11 字型檔。** 使用者要提供，交由你做 woff2 子集化與 unicode-range 分片。
   授權為開源免費可商用。

**隨時可補：**

5. **`packages/shared/data/holidays.json` 尚未經人工核對**（`verified: false`），
   `holidays.test.ts` 裡有一個測試就是在檢查這個旗標，會持續提醒。
   核對完把旗標改 `true` 並刪掉那個測試。
   另外**學校行事曆的停課日**（颱風假、校慶、運動會、考試週停課）行政院公告裡沒有，
   要由使用者補進 `schoolClosures`。
6. **舊原型 `D:\專案\歐趴EZ\index.html`**（單檔 Vue 3 + Tailwind）要不要搬邏輯過來，
   還是整個重寫。目前假設是重寫。

---

## UI 規範（像素復古風）

- **混合字型**：標題、按鈕、標籤、數字用俐方體 Cubic 11（需自行下載並子集化成 woff2，
  用 `unicode-range` 分片）；使用者輸入的長內容與公式用 Noto Sans TC 與 KaTeX。
- **像素字只用 11 / 22 / 33px。** Cubic 11 是 11×11 點陣，只有整數倍才銳利。
  另需 `-webkit-font-smoothing: none`，否則 Retina 上抗鋸齒會把點陣糊掉。
- **配色**依規格書第 7 節；放文字的綠色 `#008751`（對白底 4.58:1）、
  紅色 `#C4003B`（6.16:1），所有文字對比需達 WCAG AA。
- **狀態不能只靠顏色區分**，一律搭配符號或圖樣
  （例：缺重點 = 紅框 + 斜線底紋 + ▲ 三重編碼）。
- **所有可點元件的觸控範圍至少 44×44px**；按下時硬陰影消失、位移 3px；動畫使用 `steps()`。
- **底部導覽圖示以 16×16 點陣繪製**；有意義的圖示加 `aria-label`，裝飾性的加 `aria-hidden`。
- **手機優先**，桌面版使用同一套 token。

視覺與功能依據見 `docs/00_architecture.html`（功能架構圖、軟體架構圖、UI 介面四個畫面）。

---

## 完成標準（階段一）

- `pnpm test` 全部通過，包含安全規則測試與純函式測試。
- 用 Emulator 可以完整走過：建立群組 → 開學設定精靈 → 另一個帳號用邀請連結加入並選科目
  → 管理者新增作業與關鍵字 → 檢視者在總覽看到。
- README 說明如何在本機啟動 Emulator 與前端。

---

## 常用指令

```bash
pnpm install
pnpm test        # 全部測試
pnpm typecheck   # 型別檢查
pnpm build       # 前端 + Functions 打包
pnpm dev         # 前端 http://localhost:5173
pnpm emu         # Emulator，UI 在 http://localhost:4000
```

Functions 需先打包模擬器才載入得到：`pnpm --filter @jindu/functions build`

---

## 原始文件的狀況

使用者原本提到的 `jindu-project/START-HERE.md`、`docs/01_spec.md`、`docs/02_test-log.md`、
`design/` 這些文件**找不到**。目前整個專案是依使用者訊息裡的需求重建的，
所有推定的部分都列在上面的「尚未拍板的事項」。若使用者之後找回原始規格書，以原文為準。
