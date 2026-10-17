import {defineConfig} from 'vite'
export default defineConfig({envDir:false,cacheDir:'.cache-b13',build:{outDir:'.preview-build',emptyOutDir:false,lib:{entry:'src/preview-worker.ts',formats:['es'],fileName:()=> 'worker.js'},target:'es2022',minify:false}})
