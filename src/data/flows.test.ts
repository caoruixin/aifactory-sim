import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from './index'
describe('五套系统自己的请求剧本',()=>{
  it('每套系统均有独立剧本，连接不跨错系统',()=>{
    expect(FACTORY_PACK.flows).toHaveLength(5)
    for(const system of FACTORY_PACK.systems) {
      const flow=FACTORY_PACK.flows.find(f=>f.systemId===system.id)!
      expect(flow).toBeDefined()
      for(const step of flow.steps) for(const id of step.connectionIds) expect(FACTORY_PACK.connections.find(c=>c.id===id)?.systemId).toBe(system.id)
    }
  })
  it.each(FACTORY_PACK.flows)('$systemId 的 MoE 是 prefill / decode 层内循环',flow=>{
    for(const loop of ['prefill-layer','decode-layer-token']) {
      const steps=flow.steps.filter(s=>s.loopContext===loop)
      const keys=steps.map(s=>s.id.split('.').at(-1))
      expect(keys.some(k=>k?.endsWith('router'))).toBe(true)
      expect(keys.some(k=>k?.endsWith('dispatch'))).toBe(true)
      expect(keys.some(k=>k?.endsWith('experts'))).toBe(true)
      expect(keys.some(k=>k?.endsWith('combine'))).toBe(true)
      expect(steps.find(s=>s.payload==='kv')?.logicalOnly).toBe(false)
    }
    expect(flow.steps[0]?.payload).toBe('request')
    expect(flow.steps.at(-1)?.payload).toBe('token')
    expect(flow.steps.find(s=>s.phase==='prefill')?.description).toContain('权重常驻')
  })
  it('HGX 域界、LPX 逐层协作与 NVL576 证据边界均明确',()=>{
    expect(FACTORY_PACK.flows.find(f=>f.systemId==='sys.hgx-b300')!.summary).toContain('八卡')
    expect(FACTORY_PACK.flows.find(f=>f.systemId==='sys.groq3-lpx')!.summary).toContain('每层')
    expect(FACTORY_PACK.flows.find(f=>f.systemId==='sys.rubin-ultra-nvl576')!.summary).toContain('仅定性')
  })
})
