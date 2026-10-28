import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/** The built app runs only its own bundled scripts: no inline scripts and no eval. Development keeps them for hot reload. */
const strictScripts = (): Plugin => ({
  name: 'strict-script-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace("script-src 'self' 'unsafe-inline' 'unsafe-eval'", "script-src 'self'")
})

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [tailwindcss(), react(), strictScripts()]
  }
})
