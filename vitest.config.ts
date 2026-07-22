import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    testTimeout: 15000,
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      CONTENT_UPLOAD_IDEMPOTENCY_SECRET: 'test-secret'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'server-only': path.resolve(__dirname, 'tests/__mocks__/server-only.js'),
    },
  },
});
