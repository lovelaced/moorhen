import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'workers/**/*.test.ts', 'apps/mobile/src/lib/**/*.test.ts'],
  },
})
