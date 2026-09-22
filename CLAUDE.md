# 進度本 — 專案脈絡

大學班級共用的課程進度、作業提醒與考試重點複習工具。
回覆一律使用繁體中文，git commit 訊息也是。

---

## 目前進度：階段一，步驟 8 / 8 已完成（階段一結束）

```
________ 總覽／作業／筆記／進度四頁、缺重點標示             ← 步驟 8
b5dbc68 我修的科目、內容項目四型                             ← 步驟 7
d65174e 學期、科目、章節樹 CRUD 排序、開學設定精靈           ← 步驟 6
32dca5b 設計 token、Cubic 11 子集化、外殼與底部導覽           ← 步驟 5
afff92b 實作 Google 登入、建立群組、邀請連結與多群組切換      ← 步驟 4
ee9af2d 實作 Firestore／Storage 安全規則與權限表逐格測試   ← 步驟 3
882349a 實作 packages/shared 的共用純函式與單元測試        ← 步驟 2
0401725 建立 Monorepo 骨架與開發環境                       ← 步驟 1
```

驗證狀態：`pnpm test` 612 個測試全過（shared 205 + rules-tests 315 + functions 61 + web 31）、
`pnpm typecheck` 通過、`pnpm build` 通過。

Emulator + 瀏覽器走過完成標準的整條路：管理者建立群組 → 開學設定精靈三步驟
（科目與時段、貼上目錄解析出 7 個節點且三層的 `1-1-1` 壓成小節、產生邀請連結）
→ 另一個帳號用連結加入拿到檢視者角色並勾選我修的科目 → 管理者新增兩筆作業
（「下堂課」自動跳過 2026-09-28 教師節落到 10/05）與三個含 LaTeX 的關鍵字
→ 檢視者在總覽看到 7 天內那一筆（10/05 那筆正確被排除在窗口外）。
進度頁的缺重點標示與定義一致：第一章自己沒有關鍵字但底下 1-1 有，所以不算缺，
其餘 5 個節點是紅框 + 斜線底紋 + ▲ 三重編碼。全程沒有 console 錯誤。

走查裡只有「Google 登入」這一步沒有走真實彈出視窗——彈出視窗開在
Chrome 擴充套件的分頁群組之外，自動化點不到，改用 Auth Emulator 的
`accounts:signInWithIdp` 換發 token 再寫進 IndexedDB。登入之後的每一步都是真的 UI。

`packages/rules-tests` 是唯一需要 Emulator 的套件，`test` script 會先打包 Functions，
再用 `firebase emulators:exec --project demo-jindu` 起 Auth / Firestore / Storage /
Functions。**它會占用 8080 / 9199 / 9099 / 5001，和 `pnpm emu` 衝突。**

本機開發用的 `apps/web/.env.local`：`VITE_USE_EMULATOR=true`、
`VITE_FIREBASE_PROJECT_ID=demo-jindu`，其餘維持佔位值。

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
| 3 | Firestore 資料模型 + `firestore.rules` + `storage.rules` + 權限表逐格測試 | ✅ 完成 |
| 4 | Google 登入、建立群組、邀請連結（`joinByInvite` / `rotateInvite`）、多群組切換 | ✅ 完成 |
| 5 | 設計 token、Cubic 11 子集化、外殼與底部導覽 | ✅ 完成 |
| 6 | 學期、科目、章節樹 CRUD 排序、開學設定精靈三步驟 | ✅ 完成 |
| 7 | 我修的科目、內容項目四型（作業快速日期、關鍵字批次、檔案、連結） | ✅ 完成 |
| 8 | 總覽／作業／筆記／進度四頁、缺重點標示、Emulator 全流程走查 | ✅ 完成 |

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
Cloud Functions 用 `enforceAppCheck: true`（設於 `functions/src/options.ts`，
**每個函式明確帶上**——`setGlobalOptions` 因為 ESM 的載入順序會套不上去，
詳見該檔註解）。

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
| 「移除檢視者」怎麼在規則裡驗 | 規則沒有迴圈，改用計數：`roles.values().removeAll([另外兩種角色]).size()` 得到各角色人數，要求 viewer 少一、admin／owner 不變 | 無法用動態 key 去查被移除者原本的角色 |
| 角色變更一次只能動一個人 | 移除檢視者／自行退出都限制 `removedKeys().size() == 1` | 讓上面的計數判斷能精確對應到單一動作 |
| 已軟刪除的文件 | 只能復原，不能一邊維持 `deletedAt` 一邊改內容 | 規格沒寫，取較嚴的一邊；復原時可同時改欄位 |
| 規則測試套件 | 獨立的 `packages/rules-tests`，`test` script 內含 `firebase emulators:exec` | `pnpm test` 就能一起跑到，不必要求先手動開模擬器 |
| Functions 設定 | 不用 `setGlobalOptions`，區域與 `enforceAppCheck` 由 `options.ts` 匯出常數，每個函式明確帶上 | ESM 的 import 會在 `index.ts` 本體執行前就把子模組的函式定義完，全域設定套不上去（實際踩過：函式跑到 us-central1 且沒開 App Check） |
| `userGroups` 索引 | 由 `onGroupWritten` 觸發器維護，前端只讀 | 規則對它是 `allow write: if false`，非成員也寫不到自己的索引 |
| 成員離開後的 `members` 文件 | 同一個觸發器軟刪除 | 規則只讓本人寫自己那筆，被踢出後沒人能清 |
| 邀請連結 | 可以有多張；`rotateInvite` 會把該群組所有還有效的邀請標成 `revokedAt` 再發一張新的 | 型別裡 `revokedAt` 與 `expiresAt` 都有，這樣兩個欄位才各司其職 |
| 邀請的明碼 token | 只在 `createInvite` / `rotateInvite` 的回傳值出現一次 | Firestore 只存 hash，關掉就拿不回來，只能重新產生 |
| 前端路由 | `react-router-dom` v6 | 架構圖已經規定了 `/app/*`、`/join/:token`、`/liff/*` 的路徑 |
| 像素字級 | 12 / 24 / 36px | Cubic 11 的 em 裡剛好 12 個點，只有 12 的整數倍才對齊像素格線（量測見上） |
| Cubic 11 來源 | `scripts/build-fonts.mjs` 從官方 repo 的固定 tag 下載，比對 SHA-256，快取在 gitignore 的 `.font-cache/` | 2.7 MB 的 ttf 不進版控，但版本與內容可驗證 |
| 字型分片 | `core`（非中文）＋`ui`（掃描原始碼取得的介面用字）＋19 片依碼位切的 `cjk-NN` | 一般畫面只下載 core + ui 共 47.8 KB，而不是整份 400 KB |
| 綠色的使用範圍 | `--green` 只放白底 | 對米色底 `#FFF1E8` 只有 4.14:1，未達 AA |
| 導覽圖示 | 16×16 點陣，顯示 32px（2×） | 16px 在手機上太小看不清，非整數倍會糊 |
| 排序的實作 | 上下移動＝和鄰居對調 `order`，固定兩筆寫入 | UI 是 ↑↓ 按鈕不是拖曳，對調最簡單也不會用光間隔；計算在 `packages/shared/src/order.ts`，有 32 個測試 |
| 「目前學期」 | 記在 `groups/{gid}.activeSemesterId` | 若改成在學期文件上放 `isActive`，要同時改兩筆才能保證只有一個，規則擋不住中間狀態 |
| 刪章 | 連同底下的小節一起軟刪除（同一個 batch） | 留著孤兒小節在兩層樹上根本顯示不出來 |
| 刪除確認 | 自製兩段式 `ConfirmButton`，不用 `window.confirm()` | 原生對話框是系統樣式，和像素風差太多；而且會卡住自動化測試 |
| 章節查詢 | 整棵樹一次查回來（只帶 `deletedAt == null`），在前端組結構 | 一個科目的章節就是一份目錄，量很小，省掉複合索引 |
| 上傳限制的來源 | `packages/shared/src/limits.ts` 的 `MAX_UPLOAD_BYTES`；`storage.rules` 另外寫死同一個數字 | 規則檔沒辦法 import，改成用 `apps/web/test/safety.test.ts` 比對兩邊 |
| KaTeX | 只在文字含有 `$` 時才動態 import，獨立成 258 KB 的 chunk | 不讓它進主 bundle；`trust: false` / `strict: 'warn'` 有測試釘住 |
| 連結型項目的網址 | `normalizeUrl()` 只放行 http(s)，沒寫 scheme 的補 https | `javascript:`、`data:` 會被當成連結塞進 DOM |
| 檔案的軟刪除 | 只軟刪除 item，Storage 物件留著 | 規則禁止刪除物件；孤兒檔由階段二的排程 Function 清理 |
| 「我修的科目」為空 | 視為還沒選過，列表顯示全部 | 給空白畫面只會讓人以為壞掉 |
| 總覽的時間範圍 | 未來 7 天，另外把過去 14 天內逾期的獨立列在上面 | 只看未來七天的話，最需要補交的那幾筆反而看不到；再久以前的擺著只是噪音 |
| 總覽與作業頁的查詢 | collection group 一次查整個群組的 `type == 'homework'`，在前端依「我修的科目」過濾 | 沿用檢視者可見範圍的決策；逐科目查會變成 N 次查詢 |
| 筆記頁的查詢 | 一次只看一個科目，用單一科目底下的 items | 不必再開複合索引，關鍵字／檔案／連結三型一起拿回來在前端分組 |
| 四個主要分頁不做 lazy | 只有設定底下那一串（科目、章節、內容、精靈、邀請）切 chunk | 進 app 第一眼就會用到四個分頁，切開反而多一次往返 |
| 進度頁的「目前」 | 目前進度落在小節上時，它所屬的那一章也標「目前」而不是「完成」 | 那一章顯然還在上 |

---

## 尚未拍板的事項

（步驟 3 的權限表問題已解決：使用者於 2026-09-22 提供 `docs/01_spec_section3.md`。）

（步驟 5 的三個問題已於 2026-09-22 解決：科目 12 色採用架構圖提案、
階段一不做深色模式、Cubic 11 由 Claude 自官方 repo 取得並子集化。）

**隨時可補：**

1. **綠色 `#008751` 只能放白底。** 對頁面底色 `#FFF1E8` 只有 4.14:1，未達 AA。
   目前的規則是綠色文字一律在白底面板上。若要在米色底用綠字，需要另定一個較深的綠。
2. **`packages/shared/data/holidays.json` 尚未經人工核對**（`verified: false`），
   `holidays.test.ts` 裡有一個測試就是在檢查這個旗標，會持續提醒。
   核對完把旗標改 `true` 並刪掉那個測試。
   另外**學校行事曆的停課日**（颱風假、校慶、運動會、考試週停課）行政院公告裡沒有，
   要由使用者補進 `schoolClosures`。
3. **舊原型 `D:\專案\歐趴EZ\index.html`**（單檔 Vue 3 + Tailwind）要不要搬邏輯過來，
   還是整個重寫。目前假設是重寫。

---

## UI 規範（像素復古風）

- **混合字型**：標題、按鈕、標籤、數字用俐方體 Cubic 11（需自行下載並子集化成 woff2，
  用 `unicode-range` 分片）；使用者輸入的長內容與公式用 Noto Sans TC 與 KaTeX。
- **像素字只用 12 / 24 / 36px。**（原本寫 11 / 22 / 33，實際量過字型後修正——見下方說明。）
  另需 `-webkit-font-smoothing: none`，否則 Retina 上抗鋸齒會把點陣糊掉。
- **配色**依規格書第 7 節；放文字的綠色 `#008751`（對白底 4.58:1）、
  紅色 `#C4003B`（6.16:1），所有文字對比需達 WCAG AA。
- **狀態不能只靠顏色區分**，一律搭配符號或圖樣
  （例：缺重點 = 紅框 + 斜線底紋 + ▲ 三重編碼）。
- **所有可點元件的觸控範圍至少 44×44px**；按下時硬陰影消失、位移 3px；動畫使用 `steps()`。
- **底部導覽圖示以 16×16 點陣繪製**，顯示時放大整數倍（目前 2×＝32px）才不會糊；
  有意義的圖示加 `aria-label`，裝飾性的加 `aria-hidden`。
- **手機優先**，桌面版使用同一套 token。

### 為什麼是 12 / 24 / 36 而不是 11 / 22 / 33

量過 Cubic 11 v1.500 的實際輪廓：**一個點是 100 font units，`unitsPerEm` 是 1200**，
所以一個 em 裡剛好 12 個點（全形字的 advance 是 1300＝13 個點）。
`font-size` 必須是 12 的整數倍，一個點才會對齊一個 CSS 像素。

瀏覽器實測每個全形字的寬度：

| font-size | 每字寬 | 是否對齊 |
| --- | --- | --- |
| 11px | 11.9103px | ✗ |
| 12px | 13px | ✓ |
| 22px | 23.8266px | ✗ |
| 24px | 26px | ✓ |
| 33px | 35.75px | ✗ |
| 36px | 39px | ✓ |

「11×11」講的是字身的點陣大小，不是 em。原本的 11 / 22 / 33 會讓一個點變成
11/12 個 CSS 像素，點陣邊緣糊掉，正好違背這條規則想達到的目的。
`apps/web/test/design-tokens.test.ts` 有測試守住「必須是 12 的整數倍」。
若之後決定改回 11 / 22 / 33，改 `tokens.css` 三個變數與那個測試即可。

---

視覺與功能依據見 `docs/00_architecture.html`（功能架構圖、軟體架構圖、UI 介面四個畫面）。
權限規格見 `docs/01_spec_section3.md`（角色、權限表、規則判斷邏輯、測試要求）。

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
