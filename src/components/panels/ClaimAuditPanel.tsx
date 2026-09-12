import { useState } from 'react'
import { FACTORY_PACK } from '../../data'
import { claimDisposition, VERIFICATION_LABELS } from '../../data/verification'
import { claimInventory, claimKey } from '../../data/claimInventory'
import ClaimRow from '../ui/ClaimRow'
const rows=claimInventory(FACTORY_PACK).map(r=>({...r,id:claimKey(r)}))
export default function ClaimAuditPanel() {
  const [filter,setFilter]=useState('all')
  const [expanded,setExpanded]=useState(false)
  const counts=Object.fromEntries(Object.keys(VERIFICATION_LABELS).map(k=>[k,rows.filter(r=>claimDisposition(r.claim)===k).length]))
  return <section className="my-4 rounded-lg border border-line p-4" data-claim-audit>
    <h2 className="text-base font-semibold">规格核验清单 · 2026-09-12</h2>
    <p className="mt-2 text-xs text-dim">修改前 610 条 Claim，其中 107 条为空；当前 {rows.length} 条。逐项核对原始出处并记录处理结论；未知参数区分部署决定、范围冲突和未找到依据。</p>
    <div className="my-2 flex flex-wrap gap-3 text-xs">{Object.entries(counts).map(([k,n])=><span key={k}>{VERIFICATION_LABELS[k as keyof typeof VERIFICATION_LABELS]}：{n}</span>)}</div>
    <div className="flex gap-4 text-xs text-accent"><a href={`${import.meta.env.BASE_URL}audit/claims-2026-09-12.json`} download>完整清单 JSON（原值 / 采纳值 / 来源）</a><a href={`${import.meta.env.BASE_URL}audit/claims-2026-09-12.csv`} download>下载 CSV</a></div>
    <details className="mt-3 text-xs" onToggle={e=>setExpanded(e.currentTarget.open)}><summary className="cursor-pointer">查看条目与待确认原因</summary><label className="my-2 block">处理结论 <select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded border border-line bg-panel p-1"><option value="all">全部</option>{Object.entries(VERIFICATION_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <dl className="max-h-96 divide-y divide-line overflow-y-auto">{expanded && rows.filter(r=>filter==='all'||claimDisposition(r.claim)===filter).map(r=><ClaimRow key={r.id} name={r.id} claim={r.claim}/>)}</dl>
    </details>
  </section>
}
