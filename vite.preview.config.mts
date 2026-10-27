import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({base:'/',envDir:false,cacheDir:'.cache-b13',plugins:[react()],build:{outDir:'dist-preview-final',emptyOutDir:false}})
