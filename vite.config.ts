import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
      // Workspace packages use symlinks that can't cross Docker volume boundaries,
      // so resolve them directly to the source.
      '@copilot-budget/calculator-core': resolve(projectRoot, 'packages/calculator-core/src/index.ts'),
    }
  },
  server: {
    port: 5002,
    strictPort: true,
    watch: {
      // Docker volume mounts on macOS need polling since inotify events don't propagate reliably.
      // Set VITE_USE_POLLING=true in Dockerfile.dev; has no effect on native dev.
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/components/ui/**', 'src/test/**', 'src/**/*.test.*', 'src/vite-end.d.ts'],
    },
  },
});
