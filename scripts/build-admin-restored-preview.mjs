import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {build} from 'vite'
import react from '@vitejs/plugin-react'
const root=process.cwd(),pkg=path.join(root,'ci/admin-preview-b17')
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='xw564477242-cmyk/fastlik-Admin'||process.env.GITHUB_REF!=='refs/heads/codex/fl-launch-b17-admin-preview-ci-20261025'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'||!/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA||''))throw Error('EXACT_BUILD_CONTEXT_REQUIRED')
const source=await fs.readFile(path.join(pkg,'APPROVED-SOURCE-SHA256SUMS'),'utf8'),lines=source.trim().split('\n')
if(lines.length!==16)throw Error('SOURCE_SCOPE_MISMATCH')
for(const line of lines){const m=/^([0-9a-f]{64})  (src\/[A-Za-z0-9_./-]+)$/.exec(line);if(!m||m[2].includes('..'))throw Error('SOURCE_PATH_REFUSED');if(createHash('sha256').update(await fs.readFile(path.join(root,m[2]))).digest('hex')!==m[1])throw Error('SOURCE_SHA_MISMATCH')}
const snapshot=createHash('sha256').update(source).digest('hex'),head=process.env.GITHUB_SHA,candidate='FL-LAUNCH-B17-20261026-full-admin'
const out=path.join(root,'.admin-read-ci-build')
await build({root,configFile:false,envDir:false,cacheDir:path.join(out,'cache'),base:'/',plugins:[react()],define:{
 'import.meta.env.VITE_FASTLINK_API_URL':JSON.stringify('/api'),
 'import.meta.env.VITE_FASTLINK_ENVIRONMENT':JSON.stringify('TEST'),
 'import.meta.env.VITE_FASTLINK_BUILD_SHA':JSON.stringify(head),
 'import.meta.env.VITE_FASTLINK_SOURCE_SNAPSHOT':JSON.stringify(snapshot),
 'import.meta.env.VITE_FASTLINK_CANDIDATE_ID':JSON.stringify(candidate),
 'import.meta.env.VITE_FASTLINK_PREVIEW_MODE':JSON.stringify('READ_ONLY')},build:{outDir:out,emptyOutDir:false,sourcemap:false,manifest:false}})
await fs.copyFile(path.join(out,'index.html'),path.join(pkg,'frontend/public/index.html'))
for(const name of await fs.readdir(path.join(out,'assets'))){if(!/^[A-Za-z0-9_-]+\.(?:js|css)$/.test(name))throw Error('ASSET_SCOPE_REFUSED');await fs.copyFile(path.join(out,'assets',name),path.join(pkg,'frontend/public/assets',name))}
await fs.writeFile(path.join(pkg,'frontend/admin-release-identity.mjs'),'export const adminReleaseIdentity = Object.freeze('+JSON.stringify({buildSha:head,snapshot,candidate})+');\n')
const names=['wrangler.json','frontend/worker.js','frontend/safe-preview-diagnostics.mjs','frontend/admin-restored-read-routing.mjs','frontend/admin-release-identity.mjs','frontend/public/index.html','frontend/public/runtime-config.js']
for(const name of await fs.readdir(path.join(pkg,'frontend/public/assets')))names.push('frontend/public/assets/'+name)
if(names.length!==12)throw Error('EXACT_RELEASE_FILE_COUNT_REFUSED')
const hashes=[];for(const name of names.sort())hashes.push(createHash('sha256').update(await fs.readFile(path.join(pkg,name))).digest('hex')+'  '+name)
await fs.writeFile(path.join(pkg,'APPROVED-SHA256SUMS'),hashes.join('\n')+'\n')
console.log(JSON.stringify({status:'FIXED_SOURCE_BUILD_COMPLETE',sourceHead:head,sourceSnapshot:snapshot,payloadFiles:names.length,accessOrLeaseChanged:false}))
