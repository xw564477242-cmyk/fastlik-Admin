import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({root, envDir:false, cacheDir:root+'/.cache-b11', plugins:[react()],
  build:{outDir:root+'/dist', emptyOutDir:false}, server:{host:'127.0.0.1',strictPort:true}})
