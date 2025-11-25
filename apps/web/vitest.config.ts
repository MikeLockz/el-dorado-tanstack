import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const shouldRunStorybookTests = process.env.VITEST_STORYBOOK === '1';
const storybookProjects = shouldRunStorybookTests ? [{
  extends: true,
  plugins: [
  // The plugin will run tests for the stories defined in your Storybook config
  // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
  storybookTest({
    configDir: path.join(dirname, '.storybook')
  })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{
        browser: 'chromium'
      }]
    },
    setupFiles: ['.storybook/vitest.setup.ts']
  }
}] : undefined;

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    ...(storybookProjects ? { projects: storybookProjects } : {})
  }
});