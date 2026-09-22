/**
 * 只給「真的部署到雲端」用，`pnpm run build:deploy` 會跑這個腳本
 * （先跑過 `build` 產生 lib/，這個腳本接著把結果搬進 .deploy/）。
 *
 * 為什麼不能直接把 firebase.json 的 functions.source 指到 lib/：
 * firebase-tools 不管是 `firebase deploy` 還是 Emulator，載入函式定義前都會
 * 先在本機找 <source>/node_modules/firebase-functions，而且不會像 Node.js
 * 正常的 require 那樣往上層資料夾找——lib/ 底下沒有自己的 node_modules
 * （相依套件裝在 functions/node_modules，pnpm workspace 的 symlink 只在那裡），
 * 所以指到 lib/ 兩條路都會死在「Failed to find location of Firebase
 * Functions SDK」。
 *
 * 也不能維持指到 functions/ 整個資料夾（原本的設定）：那樣 Cloud Build
 * 遠端 `npm install` 讀到的是資料夾根目錄的 functions/package.json，
 * 裡面 "@jindu/shared": "workspace:*" 這個 pnpm 專屬協定 npm 看不懂，
 * 會直接炸掉（EUNSUPPORTEDPROTOCOL）。
 *
 * 所以這裡另外準備一個自成一體的 .deploy/：複製 lib/ 的打包結果過去，
 * 再對它做一次真正的 `npm install`（不是 pnpm workspace symlink），
 * 讓 firebase-functions／firebase-admin 是貨真價實裝在
 * .deploy/node_modules 底下的套件。這樣本機掃描找得到 SDK，
 * Cloud Build 收到的 package.json 也沒有 workspace: 協定。
 *
 * 平常開發、跑測試、開 Emulator（pnpm emu / pnpm test）完全不會走到這裡，
 * 用的還是 lib/，不需要網路也不會變慢。只有要部署時才跑這個、
 * 也只有這時候才需要網路連線去下載套件。
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';

const DEPLOY_DIR = '.deploy';

await rm(DEPLOY_DIR, { recursive: true, force: true });
await mkdir(DEPLOY_DIR, { recursive: true });
await cp('lib/index.js', `${DEPLOY_DIR}/index.js`);
await cp('lib/index.js.map', `${DEPLOY_DIR}/index.js.map`);
await cp('lib/package.json', `${DEPLOY_DIR}/package.json`);

console.log('安裝部署用的相依套件（firebase-admin、firebase-functions，真的 npm install，不是 workspace symlink）...');
// Windows 上 npm 是 npm.cmd，不開 shell 會直接找不到執行檔（ENOENT）。
// Node 的 deprecation 警告是在提醒「參數含使用者輸入時」shell: true 有逸出風險，
// 但這裡的參數是寫死的字串常數，不接任何外部輸入，沒有那個風險。
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: DEPLOY_DIR,
  stdio: 'inherit',
  shell: true,
});

console.log(`已產生 functions/${DEPLOY_DIR}/，可以用 firebase.deploy.json 部署了`);
