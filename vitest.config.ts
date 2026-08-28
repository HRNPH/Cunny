import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node', // per-file override: // @vitest-environment happy-dom
    include: ['src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
  },
})
