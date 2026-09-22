/**
 * Cloud Functions 打包設定。
 *
 * 為什麼不直接讓 Firebase CLI 上傳 functions 目錄：
 * pnpm workspaces 的 node_modules 是 symlink，CLI 打包時無法正確解析
 * `@jindu/shared` 這類 workspace 相依（firebase-tools issue #5552、#5911）。
 * 改成用 esbuild 把 shared 內聯進單一 lib/index.js，部署時就完全沒有
 * workspace 相依，CLI 只需要安裝 lib/package.json 裡列出的外部套件。
 */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

// 部署時要安裝的外部相依。firebase-admin/firestore 這類 subpath 不會被
// 'firebase-admin' 這個字串比對到，所以要另外列 wildcard。
const DEPENDENCIES = ['firebase-admin', 'firebase-functions'];
const EXTERNAL = [...DEPENDENCIES, ...DEPENDENCIES.map((name) => `${name}/*`)];

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: EXTERNAL,
  logLevel: 'info',
});

// 部署用的最小 package.json，只列外部相依。
const pkg = JSON.parse(
  await import('node:fs/promises').then((fs) => fs.readFile('package.json', 'utf8')),
);
await mkdir('lib', { recursive: true });
await writeFile(
  'lib/package.json',
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      main: 'index.js',
      engines: pkg.engines,
      dependencies: Object.fromEntries(
        DEPENDENCIES.map((name) => [name, pkg.dependencies[name]]),
      ),
    },
    null,
    2,
  )}\n`,
);
console.log('已產生 lib/package.json');
