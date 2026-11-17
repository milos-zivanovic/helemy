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
  },
})
