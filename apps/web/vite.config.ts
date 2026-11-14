import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3005 },
  preview: { port: 3005 },
  // Pre-bundle at startup: found late, Vite re-optimizes mid-session and
  // serves the old chunk as 504, so the page never hydrates.
  optimizeDeps: { include: ['motion/react'] },
  // one id for client and server, so an open tab can spot a newer deploy
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'),
  },
  plugins: [
    devtools(),
    nitro(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Icons compile to inline SVG components at build time: no runtime fetch,
    // and they render on the server.
    Icons({ compiler: 'jsx', jsx: 'react' }),
  ],
})

export default config
