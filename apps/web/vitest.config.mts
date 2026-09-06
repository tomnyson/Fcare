import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig của Next đặt jsx: preserve — vitest phải tự biên dịch JSX khi test
  // import module .tsx (helper thuần nằm chung file với component).
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
