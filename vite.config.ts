import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const v2TrailingSlashRedirect: Plugin = {
  name: 'pageecho-v2-trailing-slash',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] === '/v2') {
        response.statusCode = 307
        response.setHeader('Location', '/v2/')
        response.end()
        return
      }
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] === '/v2') {
        response.statusCode = 307
        response.setHeader('Location', '/v2/')
        response.end()
        return
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [
    v2TrailingSlashRedirect,
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      input: [
        fileURLToPath(new URL('./index.html', import.meta.url)),
        fileURLToPath(new URL('./v2/index.html', import.meta.url)),
      ],
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.PAGEECHO_SERVER_PORT || '8787'}`,
        changeOrigin: false,
      },
    },
  },
})
