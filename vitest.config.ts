// Unit tests run in plain Node, without the IWSDK dev plugin from vite.config.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
