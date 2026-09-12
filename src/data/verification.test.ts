import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from './index'
import { claimInventory, claimKey } from './claimInventory'
import { claimDisposition } from './verification'
import { claimSourceUrl } from './sourceLinks'
import { packForHardwareProfile } from './specifications'
import { GB300_COMPONENTS } from './gb300-nvl72'

describe('完整核验清单与规格范围',()=>{
  it('每条 Claim 有处理结论；导出与当前内容一一对应，不会漏掉原先的空值',()=>{
    const audit=JSON.parse(readFileSync('public/audit/claims-2026-09-12.json','utf8'))
    expect(audit.baselineClaims).toBe(610);expect(audit.baselineNulls).toBe(107)
    const entries=claimInventory(FACTORY_PACK)
    expect(audit.currentClaims).toBe(entries.length)
    for(const entry of entries) {
      const row=audit.rows.find((r:{id:string})=>r.id===claimKey(entry))
      expect(row,claimKey(entry)).toBeDefined()
      expect(row.adoptedValue).toEqual(entry.claim.value)
      expect(row.disposition).toBe(claimDisposition(entry.claim))
      expect(row.conclusion.length).toBeGreaterThan(0)
      expect(claimDisposition(entry.claim)).not.toBe('existing-source')
    }
  })
  it('网页与手册切换同时作用于 GPU、HBM、NVLink 芯片和托盘；未知托盘带宽不反推',()=>{
    const web=packForHardwareProfile(FACTORY_PACK,'maxlps'),pdf=packForHardwareProfile(FACTORY_PACK,'datasheet')
    for(const [pack,gpu,tray,rack] of [[web,3,12,216],[pdf,3.6,14.4,260]] as const) {
      const chip=pack.components.find(c=>c.id==='cmp.rubin.nvlink6-switch-chip')!
      expect(chip.specs.perGpuBandwidthTBs!.value).toBe(gpu)
      expect(chip.specs.aggregateBandwidthPerRackTBs!.value).toBe(rack)
      expect(pack.connections.find(c=>c.id==='con.rubin.tray-midplane')!.bandwidth!.value).toBe(tray)
    }
    expect(web.components.find(c=>c.id==='cmp.rubin.nvlink6-switch-tray')!.specs.trayBandwidthTBs!.value).toBeNull()
    expect(pdf.components.find(c=>c.id==='cmp.rubin.nvlink6-switch-tray')!.specs.trayBandwidthTBs!.value).toBe(28.8)
  })
  it('共享存储不携带 GB300 部署目标；POD 模块只属于集群层',()=>{
    expect(FACTORY_PACK.components.find(c=>c.id==='cmp.shared.storage-array')!.specs.perNodeStorageBandwidthGBs).toBeUndefined()
    expect(FACTORY_PACK.systems.find(s=>s.id==='sys.gb300-nvl72')!.keySpecs.perNodeStorageBandwidthGBs!.value).toBe(40)
    const modules=FACTORY_PACK.assemblies.filter(a=>a.id.startsWith('asm.pod.'))
    expect(modules).toHaveLength(3)
    for(const a of modules) {
      expect(a.lodLevel).toBe('cluster');expect(a.countClaim).toBeNull()
      expect(FACTORY_PACK.assemblies.find(p=>p.id===a.parentId)!.parentId).toBeNull()
    }
  })
  it('原始导入对象不被修正层污染；重新加载仍能保存架构 288 与 SKU 279 两种口径',()=>{
    expect(GB300_COMPONENTS.find(c=>c.id==='cmp.gb300.b300-gpu')!.specs.hbmPerGpuGB!.value).toBe(288)
    const gpu=FACTORY_PACK.components.find(c=>c.id==='cmp.gb300.b300-gpu')!
    expect(gpu.specs.hbmArchitectureGB!.value).toBe(288)
    expect(gpu.specs.hbmPerGpuGB!.value).toBe(279)
  })
  it('RA 的来源链接指向参数所在的具体章节',()=>{
    const claim=FACTORY_PACK.components.find(c=>c.id==='cmp.gb300.m2-nvme')!.specs.capacityTB!
    expect(claimSourceUrl(claim,FACTORY_PACK.sources.find(s=>s.id===claim.sourceId))).toContain('/appendix-node-configurations.html')
  })
})
