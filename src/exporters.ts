const safe=(value:unknown)=>value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value)
const escapeCsv=(value:unknown)=>`"${safe(value).replaceAll('"','""')}"`
const escapeHtml=(value:unknown)=>safe(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const columns=(rows:Array<Record<string,unknown>>)=>[...new Set(rows.flatMap(row=>Object.keys(row)))]

function download(name:string,type:string,content:string){
 const url=URL.createObjectURL(new Blob([content],{type}))
 const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)
}

export function exportCsv(name:string,rows:Array<Record<string,unknown>>){
 const headers=columns(rows)
 const body=[headers.map(escapeCsv).join(','),...rows.map(row=>headers.map(key=>escapeCsv(row[key])).join(','))].join('\n')
 download(`${name}.csv`,'text/csv;charset=utf-8',`\uFEFF${body}`)
}

export function exportExcel(name:string,rows:Array<Record<string,unknown>>){
 const headers=columns(rows)
 const table=`<table><thead><tr>${headers.map(key=>`<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map(key=>`<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
 download(`${name}.xls`,'application/vnd.ms-excel;charset=utf-8',`\uFEFF${table}`)
}

export function exportPdf(title:string,rows:Array<Record<string,unknown>>){
 const headers=columns(rows)
 const popup=window.open('','_blank','noopener,noreferrer')
 if(!popup)throw new Error('浏览器阻止了 PDF 打印窗口')
 popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font:12px Arial;padding:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1><p>Generated ${new Date().toISOString()}</p><button onclick="window.print()">Print / Save PDF</button><table><thead><tr>${headers.map(key=>`<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map(key=>`<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
 popup.document.close()
}
