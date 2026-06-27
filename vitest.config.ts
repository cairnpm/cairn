import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Real LLM calls are slow; a full conversation is several round-trips.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // The intake suite shares one temp DB and a single (real) LLM provider — keep it serial.
    fileParallelism: false,
    pool: 'forks',
  },
})
