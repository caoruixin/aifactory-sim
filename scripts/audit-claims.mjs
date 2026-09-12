import { createServer } from 'vite'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const server = await createServer({server:{middlewareMode:true}})
try {
  const {FACTORY_PACK:pack} = await server.ssrLoadModule('/src/data/index.ts')
  const {claimInventory,claimKey} = await server.ssrLoadModule('/src/data/claimInventory.ts')
  const {claimSourceUrl} = await server.ssrLoadModule('/src/data/sourceLinks.ts')
  const {RUBIN_PROFILES} = await server.ssrLoadModule('/src/data/specifications.ts')
  const {claimDisposition} = await server.ssrLoadModule('/src/data/verification.ts')
  const before=JSON.parse(readFileSync('docs/audit/claims-before-2026-09-12.json','utf8'))
  const current=claimInventory(pack)
  const key=claimKey
  const now=new Map(current.map(r=>[key(r),r]))
  const old=new Map(before.map(r=>[key(r),r]))
  const row=(original,adopted)=>{
    const r=adopted??original, c=adopted?.claim??original.claim
    const source=pack.sources.find(s=>s.id===c.sourceId)
    const owner=pack.components.find(o=>o.id===r.owner)??pack.systems.find(o=>o.id===r.owner)??pack.assemblies.find(o=>o.id===r.owner)??pack.connections.find(o=>o.id===r.owner)
    const disposition=adopted?claimDisposition(c):'moved-to-system'
    const systems=pack.systems.filter(s=>s.id===r.owner||owner?.systemId===s.id||pack.assemblies.some(a=>a.componentId===r.owner&&a.systemId===s.id)).map(s=>s.id)
    const notes=c.note??''
    return {id:key(r),originalPath:original?.path??null,currentPath:adopted?.path??null,owner:r.owner,
      originalValue:original?.claim.value??null,adoptedValue:adopted?.claim.value??null,originalClaim:original?.claim??null,
      disposition,action:!original?'added':!adopted?'moved':original.claim.value===adopted.claim.value?'retained':'corrected',
      applicableSystems:systems,modelOrComponent:owner?.name??r.owner,unit:c.unit,
      scope:`${owner?.name??r.owner} / ${r.path.split('.').at(-1)}；适用范围见限定条件与来源位置`,
      direction:/双向合计|bi-directional|bidirectional/i.test(notes+' '+c.locator)?'bidirectional aggregate':/单向/.test(notes+' '+c.locator)?'unidirectional':'not specified / not applicable',
      precision:/fp16|bf16/i.test(r.path+' '+c.locator)?'FP16/BF16':/fp8/i.test(r.path)?'FP8':/fp4/i.test(r.path)?'FP4':'not applicable / unspecified',
      density:/dense|稠密/i.test(r.path+' '+notes)?'dense':/sparse|稀疏/i.test(r.path+' '+notes)?'sparse':'not applicable / unspecified',
      conditions:notes,source:{id:c.sourceId,url:claimSourceUrl(c,source),localFile:source?.localFile??null,locator:c.locator},
      auditDate:'2026-09-12',sourceAsOf:c.asOf,verifiedThisRound:disposition==='reviewed',
      review:c.review??null,
      conclusion:!adopted?'共享存储的 GB300 每节点目标已移至 sys.gb300-nvl72.keySpecs，避免污染其他系统。':disposition==='reviewed'?'已按所列官方位置核验并采纳；限定条件随值展示。':disposition==='existing-source'?'沿用既有带出处数据；本轮未逐句重做原文校验，不计入本轮已核验。':disposition==='non-spec'?'保留厂商宣称、第三方推测或教学观点及证据标签，不作为官方硬件数学输入。':`${c.review?.reason??'适用值待确认'} ${notes}`,
    }
  }
  const rows=before.map(b=>row(b,now.get(key(b)))).concat(current.filter(n=>!old.has(key(n))).map(n=>row(null,n)))
  const counts=Object.fromEntries([...new Set(rows.map(r=>r.disposition))].map(k=>[k,rows.filter(r=>r.disposition===k).length]))
  const result={hardwareProfiles:RUBIN_PROFILES,auditDate:'2026-09-12',baselineClaims:before.length,baselineNulls:before.filter(r=>r.claim.value===null).length,currentClaims:current.length,counts,rows}
  mkdirSync('public/audit',{recursive:true})
  writeFileSync('public/audit/claims-2026-09-12.json',JSON.stringify(result,null,2)+'\n')
  const cols=['id','originalValue','adoptedValue','disposition','action','applicableSystems','modelOrComponent','unit','scope','direction','precision','density','conditions','source','auditDate','sourceAsOf','conclusion']
  const cell=v=>'"'+(typeof v==='object'?JSON.stringify(v):String(v??'')).replaceAll('"','""')+'"'
  writeFileSync('public/audit/claims-2026-09-12.csv','\uFEFF'+[cols.join(','),...rows.map(r=>cols.map(k=>cell(r[k])).join(','))].join('\n')+'\n')
  console.log(JSON.stringify({baseline:before.length,current:current.length,counts}))
} finally {await server.close()}
