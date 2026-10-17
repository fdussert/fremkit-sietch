import { defineConfig } from 'vite-plus'

// The registry has no app to serve: Vite+ is used for its test runner and its linter, and this
// file only tells the test runner where the tests are.
export default defineConfig({
  test: { include: ['tools/test/**/*.test.ts'] },
})
