import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    assetsInlineLimit: 0, // Disable inlining to ensure SVGs are separate files
  },
  server: {
    allowedHosts: [
      'litigious-taunya-nonintuitive.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok-free.dev'
    ]
  }
})
