import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    base: env.VITE_PUBLIC_BASE || '/fastlik-Admin/',
    plugins: [react()],
    server: { port: 5173, host: true },
    preview: { port: 4173, host: true }
  }
})
