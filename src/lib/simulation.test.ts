import { describe, expect, it } from 'vitest'
import { estimateSystemCapacity } from './capacity'
import { DEFAULT_SCENARIO, decodeScenario, encodeScenario, resolveHardwareProfile } from './scenario'
import { decodeDuration, simulationAt } from './simulation'
import { FACTORY_PACK } from '../data'
import { useScenarioStore } from '../scenarioStore'
const e=estimateSystemCapacity({systemId:'sys.gb300-nvl72',modelId:'deepseek-v3',quantId:'fp8',scenario:{...DEFAULT_SCENARIO,outputTokens:8}})
describe('计算时钟与场景',()=>{
  it('解析累计 decode 与逐项手算相同，结束时 KV 随输出增长',()=>{
    const d=e.decode!, step=(i:number)=>Math.max(d.computeMs,d.firstMemoryMs+i*(d.lastMemoryMs-d.firstMemoryMs)/6)
    expect(decodeDuration(e,7)).toBeCloseTo(Array.from({length:7},(_,i)=>step(i)).reduce((a,b)=>a+b,0),10)
    const initial=simulationAt(e,0),done=simulationAt(e,e.ttftMs!.mid+decodeDuration(e,7)+1)
    expect(initial.generatedTokens).toBe(0);expect(done.generatedTokens).toBe(8)
    expect(done.kvPerGpuGB!-initial.kvPerGpuGB!).toBeCloseTo(70272*(2048+7)*32/1e9,10)
    expect(done.phase).toBe('complete')
  })
  it('首 token 来自 prefill；N=1 没有 decode，最后输出不占 KV',()=>{
    const one=estimateSystemCapacity({systemId:'sys.gb300-nvl72',modelId:'deepseek-v3',quantId:'fp8',scenario:{...DEFAULT_SCENARIO,outputTokens:1}})
    expect(decodeDuration(one,1)).toBe(0)
    const done=simulationAt(one,one.ttftMs!.mid)
    expect(done.phase).toBe('complete');expect(done.generatedTokens).toBe(1)
    expect(done.totalComputeMs).toBe(one.ttftMs!.mid)
    expect(done.contextTokens).toBe(4096)
    expect(done.kvPerGpuGB).toBeCloseTo(70272*4096*32/1e9,10)
    expect(simulationAt(e,e.ttftMs!.mid).generatedTokens).toBe(1)
    expect(simulationAt(e,e.ttftMs!.mid+decodeDuration(e,1)+1e-8).generatedTokens).toBe(2)
  })
  it('重复采样和播放速度不改变相同虚拟时刻的数学结果',()=>{
    const a=simulationAt(e,1000)
    useScenarioStore.getState().setPlayback({speed:4})
    expect(simulationAt(e,1000)).toEqual(a)
    expect(e.scenario).toEqual({...DEFAULT_SCENARIO,outputTokens:8})
  })
  it('场景 JSON 完整往返，恶意或损坏输入不触发无限计算',()=>{
    expect(decodeScenario(encodeScenario(DEFAULT_SCENARIO))).toEqual(DEFAULT_SCENARIO)
    for(const raw of ['{}','null','bad',JSON.stringify({v:1,...DEFAULT_SCENARIO,batch:-1})]) expect(decodeScenario(raw)).toBeNull()
  })
  it('共享输入不因切换演示 / 报告而重置，显式重置有效',()=>{
    useScenarioStore.getState().setInput({batch:17,unitCount:2})
    useScenarioStore.getState().setPlayback({view:'load'})
    expect(useScenarioStore.getState().input.batch).toBe(17)
    useScenarioStore.getState().reset();expect(useScenarioStore.getState().input).toEqual(DEFAULT_SCENARIO)
  })
  it('Rubin 规格配置的单卡与整架参数同组切换',()=>{
    const a=resolveHardwareProfile('sys.vera-rubin-nvl72','maxlps',FACTORY_PACK)!
    const b=resolveHardwareProfile('sys.vera-rubin-nvl72','datasheet',FACTORY_PACK)!
    expect([a.math?.bandwidthTBs,a.gpuSpecs.nvlinkPerGpuGBs!.value,a.systemSpecs.scaleOutBandwidthTBs!.value]).toEqual([19.2,3000,32.4])
    expect([b.math?.bandwidthTBs,b.gpuSpecs.nvlinkPerGpuGBs!.value,b.systemSpecs.scaleOutBandwidthTBs!.value]).toEqual([22,3600,28.8])
  })
})
