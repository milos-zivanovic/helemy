import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API allows this origin in CORS_ALLOWED_ORIGINS; fail instead of silently moving to 3001.
    port: 3000,
    strictPort: true,
    // In Docker on Windows the code is a bind mount, which doesn't deliver file-change events into
    // the container; polling notices the edits instead (set by the web-dev service).
    watch: process.env.WATCH_POLLING === '1' ? { usePolling: true, interval: 300 } : undefined,
  },
})
