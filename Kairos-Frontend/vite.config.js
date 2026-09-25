import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: false
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 4173),
    strictPort: true,
    allowedHosts: ['coiplet-main-frontend.onrender.com']
  }
})
