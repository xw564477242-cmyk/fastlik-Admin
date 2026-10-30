import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {createInlineAssetModule} from './admin-inline-assets.mjs'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
export const publicKeys=['VITE_FASTLINK_API_URL','VITE_FASTLINK_BUILD_SHA','VITE_FASTLINK_CANDIDATE_ID',
 'VITE_FASTLINK_ENVIRONMENT','VITE_FASTLINK_PREVIEW_MODE','VITE_FASTLINK_SOURCE_SNAPSHOT'].sort()
export function publicDefines(input) {
 if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(publicKeys)||
   input.VITE_FASTLINK_ENVIRONMENT!=='TEST'||input.VITE_FASTLINK_API_URL!=='/api'||
   input.VITE_FASTLINK_PREVIEW_MODE!=='READ_ONLY'||!/^bf72fcc33962576049ae077e80286a06b9f46fb5$/.test(input.VITE_FASTLINK_BUILD_SHA)||
   !/^[0-9a-f]{64}$/.test(input.VITE_FASTLINK_SOURCE_SNAPSHOT)||
   input.VITE_FASTLINK_CANDIDATE_ID!=='FL-LAUNCH-B17-20261030-management-flow')
  throw Error('EXACT_PUBLIC_BUILD_INPUT_REQUIRED')
 // Vite 8 collects these per-property entries into its dynamic import.meta.env map.
 // A whole import.meta.env define is overwritten by Vite's own fallback generator.
 return Object.fromEntries(publicKeys.map(key=>['import.meta.env.'+key,JSON.stringify(input[key])]))
}
export async function buildStartupFix({source,dependencies,inputPath,out,baseModules}) {
 if(process.versions.node!=='22.22.1')throw Error('FIXED_NODE_REQUIRED')
 for(const p of [source,dependencies,inputPath,out,baseModules])if(!path.isAbsolute(p))throw Error('ABSOLUTE_BUILD_PATHS_REQUIRED')
 const inputBytes=await fs.readFile(inputPath),input=JSON.parse(inputBytes),define=publicDefines(input)
 for(const [name,version] of [['vite','8.1.6'],['@vitejs/plugin-react','6.0.4']]){
  const pkg=JSON.parse(await fs.readFile(path.join(dependencies,name,'package.json'),'utf8'))
  if(pkg.version!==version)throw Error('FIXED_DEPENDENCY_VERSION_MISMATCH')
 }
 await fs.mkdir(out,{mode:0o700})
 const {build}=await import(pathToFileURL(path.join(dependencies,'vite/dist/node/index.js')))
 const react=(await import(pathToFileURL(path.join(dependencies,'@vitejs/plugin-react/dist/index.js')))).default
 const common={root:source,configFile:false,envFile:false,envDir:false,publicDir:false,
   cacheDir:path.join(out,'cache'),base:'/',plugins:[react()],define}
 await build({...common,build:{outDir:path.join(out,'public'),emptyOutDir:false,sourcemap:false,manifest:false}})
 const configProbe=async overrides=>{
  const probe=await build({...common,define:overrides,logLevel:'error',build:{write:false,minify:false,sourcemap:false,
    lib:{entry:path.join(source,'src/runtimeConfig.ts'),formats:['es'],fileName:'config-probe'}}})
  const outputs=(Array.isArray(probe)?probe:[probe]).flatMap(x=>x.output),chunk=outputs.find(x=>x.type==='chunk')
  if(!chunk||outputs.some(x=>x.type==='chunk'&&x!==chunk))throw Error('CONFIG_PROBE_SCOPE_REFUSED')
  return chunk.code
 }
 await fs.writeFile(path.join(out,'config-probe.mjs'),await configProbe(define),{flag:'wx',mode:0o600})
 await fs.mkdir(path.join(out,'negative-probes'),{mode:0o700})
 for(const [name,key] of [['missing-environment','VITE_FASTLINK_ENVIRONMENT'],['missing-api','VITE_FASTLINK_API_URL']]){
  const missing={...define};delete missing['import.meta.env.'+key]
  await fs.writeFile(path.join(out,'negative-probes',name+'.mjs'),await configProbe(missing),{flag:'wx',mode:0o600})
 }
 const inline=await createInlineAssetModule(path.join(out,'public')),modules=path.join(out,'modules')
 await fs.mkdir(modules,{mode:0o700})
 for(const name of ['worker.js','safe-preview-diagnostics.mjs','admin-restored-read-routing.mjs'])
  await fs.copyFile(path.join(baseModules,name),path.join(modules,name))
 await fs.writeFile(path.join(modules,'admin-inline-public.mjs'),inline.source,{flag:'wx',mode:0o600})
 const identity={buildSha:input.VITE_FASTLINK_BUILD_SHA,baseHeadKind:'HISTORICAL_BASE_NOT_CANDIDATE_COMMIT',
  snapshot:input.VITE_FASTLINK_SOURCE_SNAPSHOT,candidate:input.VITE_FASTLINK_CANDIDATE_ID}
 await fs.writeFile(path.join(modules,'admin-release-identity.mjs'),
  'export const adminReleaseIdentity = Object.freeze('+JSON.stringify(identity)+');\n',{flag:'wx',mode:0o600})
 const moduleFiles=[]
 for(const name of (await fs.readdir(modules)).sort()){
  const bytes=await fs.readFile(path.join(modules,name));moduleFiles.push({path:name,bytes:bytes.length,sha256:sha(bytes)})
 }
 const result={status:'OFFLINE_BUILT_NOT_DEPLOYED',source,dependencies,inputPath,publicInputSHA256:sha(inputBytes),
  publicInput:input,historicalBaseMeaning:'REUSED_HISTORICAL_UI_BASE_NOT_TRANSPORT_COMMIT',
  sourceSnapshotMeaning:'UNCHANGED_65_FILE_UI_SOURCE_SNAPSHOT_BUILD_INPUT_BOUND_SEPARATELY',
  tools:{node:process.versions.node,vite:'8.1.6',pluginReact:'6.0.4'},publicAssets:inline.manifest,moduleFiles,
  sourceModified:false,environmentFilesRead:false,networkCalls:0,backendCalls:0,publishCalls:0}
 await fs.writeFile(path.join(out,'BUILD-RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600})
 return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const flags=process.argv.slice(2)
 if(flags.length!==10||!['--source','--dependencies','--input','--out','--base-modules'].every((f,i)=>flags[2*i]===f))
  throw Error('EXACT_BUILD_ARGUMENTS_REQUIRED')
 const values=flags.filter((_,i)=>i%2===1)
 const result=await buildStartupFix(Object.fromEntries(['source','dependencies','inputPath','out','baseModules'].map((key,i)=>[key,values[i]])))
 console.log(JSON.stringify(result,null,2))
}
