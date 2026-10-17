import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
if(process.versions.node!=='22.22.1')throw Error('Fixed Node22.22.1 required')
const file=path.join(root,'.preview-build/input.json')
if(fs.lstatSync(file).isSymbolicLink())throw Error('Build input must be a regular file')
const input=JSON.parse(fs.readFileSync(file,'utf8'))
if(!/^[0-9a-f]{40}$/.test(input.baseCommit)||!/^[0-9a-f]{64}$/.test(input.sourceSnapshot)
 ||input.candidateId!=='FL-LAUNCH-B13-20261017'||input.environment!=='TEST'||input.apiUrl!=='/api')throw Error('Unbound build input')
const env={}
for(const k of ['PATH','LANG','LC_ALL','TMPDIR','NODE_OPTIONS'])if(process.env[k])env[k]=process.env[k]
Object.assign(env,{VITE_FASTLINK_API_URL:'/api',VITE_FASTLINK_ENVIRONMENT:'TEST',VITE_FASTLINK_BUILD_SHA:input.baseCommit,VITE_FASTLINK_SOURCE_SNAPSHOT:input.sourceSnapshot,VITE_FASTLINK_CANDIDATE_ID:input.candidateId,VITE_FASTLINK_PREVIEW_MODE:'READ_ONLY',WRANGLER_SEND_METRICS:'false',CI:'true'})
const commands=[["node_modules/typescript/bin/tsc", "--project", "tsconfig.app.json", "--noEmit"], ["node_modules/vite/bin/vite.js", "build", "--config", "vite.preview.config.mts"], ["node_modules/vite/bin/vite.js", "build", "--config", "vite.preview-worker.config.mts"], ["scripts/stage-preview-worker.mjs"]]
for(const args of commands){
 const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'})
 if(result.status!==0)process.exit(result.status??78)
}

