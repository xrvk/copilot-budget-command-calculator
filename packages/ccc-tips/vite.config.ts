import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'

const cccRoot = resolve(import.meta.dirname, '../..')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dts({
      include: ['src/index.ts', 'src/types.d.ts', '../../src/components/Tips.tsx'],
      rollupTypes: true,
      compilerOptions: {
        rootDir: cccRoot,
        allowArbitraryExtensions: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(cccRoot, 'src'),
      '@copilot-budget/calculator-core': resolve(cccRoot, 'packages/calculator-core/src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
})
