import { fileURLToPath } from 'node:url'
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
      experimental: { tasks: true },
      tasks: {
        'sync:games': {
          // Absolute — a relative handler path loses its `./` prefix by the time
          // Nitro's virtual tasks module imports it, and resolves as a bare
          // package specifier instead.
          handler: fileURLToPath(
            new URL('./src/server/tasks/sync-games.ts', import.meta.url),
          ),
          description: 'Pull finished chess.com games for Misri club members',
        },
      },
      // Every 20 minutes: well inside chess.com's API etiquette, and fresh
      // enough that a finished game shows up on the board within the hour.
      scheduledTasks: { '*/20 * * * *': ['sync:games'] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
