import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3005 },
  preview: { port: 3005 },
  // libsql native addon — it must stay a real Node require and never be pulled
  // into a bundle. (@libsql/client also selects between file/http/ws clients
  // at runtime, so it must resolve from node_modules rather than be bundled.)
  ssr: { external: ['@libsql/client', 'libsql'] },
  optimizeDeps: { exclude: ['@libsql/client', 'libsql'] },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//, '@libsql/client', 'libsql'] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
