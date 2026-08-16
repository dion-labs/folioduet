import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const v2Redirect: Plugin = {
  name: 'pageecho-v2-redirect',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?')[0]
      if (pathname === '/v2' || pathname === '/v2/') {
        response.statusCode = 301
        response.setHeader('Location', '/')
        response.end()
        return
      }
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?')[0]
      if (pathname === '/v2' || pathname === '/v2/') {
        response.statusCode = 301
        response.setHeader('Location', '/')
        response.end()
        return
      }
      next()
    })
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const firebaseHost = env.VITE_FIREBASE_AUTH_DOMAIN
    || (env.VITE_FIREBASE_PROJECT_ID
      ? `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`
      : 'dionlabs-fe92e.firebaseapp.com')

  return {
    plugins: [
      v2Redirect,
      react(),
      tailwindcss(),
    ],
    build: {
      rolldownOptions: {
        input: [
          fileURLToPath(new URL('./index.html', import.meta.url)),
          fileURLToPath(new URL('./pdf-to-audiobook/index.html', import.meta.url)),
          fileURLToPath(new URL('./read-and-listen-to-pdf/index.html', import.meta.url)),
        ],
      },
    },
    server: {
      // Allow Tailscale MagicDNS hosts (e.g. mac.tailXXXX.ts.net) when opening
      // the unified middleware-mode server from a phone over Tailscale.
      allowedHosts: ['.ts.net'],
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${process.env.PAGEECHO_SERVER_PORT || '8787'}`,
          changeOrigin: false,
        },
        // Firebase Auth helper (same-origin) — required for redirect login when
        // browsers block third-party cookies. See firebase redirect best practices.
        '/__/auth': {
          target: `https://${firebaseHost}`,
          changeOrigin: true,
          secure: true,
        },
        '/__/firebase': {
          target: `https://${firebaseHost}`,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
