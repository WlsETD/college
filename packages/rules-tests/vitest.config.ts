import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // 所有測試檔共用同一組 Emulator，clearFirestore() 會清掉整個資料庫，
    // 因此不能讓測試檔平行跑。
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
