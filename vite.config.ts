import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// React comes from the host through window.alethe, so the bundle never ships its own copy.
const HOST_GLOBALS = {
  react: 'alethe.react',
  'react/jsx-runtime': 'alethe.jsxRuntime',
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        copyFileSync(resolve(__dirname, 'plugin.json'), resolve(__dirname, 'dist/plugin.json'))
      },
    },
  ],
  define: mode === 'test' ? {} : { 'process.env.NODE_ENV': JSON.stringify('production') },
  css: {
    modules: {
      generateScopedName: 'jev_[local]_[hash:base64:5]',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'AletheJev',
      formats: ['iife'],
      fileName: () => 'main.js',
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: Object.keys(HOST_GLOBALS),
      output: { globals: HOST_GLOBALS },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
}))
