import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),publish=path.join(root,'.preview-build/publish')
fs.mkdirSync(publish,{recursive:true})
fs.copyFileSync(path.join(root,'.preview-build/worker.js'),path.join(publish,'worker.js'))
fs.cpSync(path.join(root,'dist-preview-final'),path.join(publish,'public'),{recursive:true})
const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.preview.jsonc'),'utf8'))
config.main='worker.js';config.assets.directory='public'
fs.writeFileSync(path.join(publish,'wrangler.json'),JSON.stringify(config,null,2)+'\n')
if(fs.existsSync(path.join(publish,'.wrangler')))throw Error('Config redirect must not enter publication root')
