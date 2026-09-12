import { describe, expect, it } from 'vitest'
import { FACTORY_PACK, modelById } from '../data'
import { CAPACITY_HEADLINE_CAVEAT, capacityUnitWordingFor, estimateSystemCapacity } from './capacity'
import { DEFAULT_SCENARIO, expertCoverage, kvGBPerGpu, resolveHardwareProfile } from './scenario'
import type { ScenarioInput } from './scenario'
const GB='sys.gb300-nvl72',HGX='sys.hgx-b300',VR='sys.vera-rubin-nvl72'
const run=(patch:Partial<ScenarioInput>={},systemId=GB,pack=FACTORY_PACK)=>{
  const scenario={...DEFAULT_SCENARIO,...patch}
  return estimateSystemCapacity({systemId,modelId:scenario.modelId,quantId:scenario.weightPrecision,scenario},pack)
}

describe('单域 TP 分配与手算',()=>{
  it('两台 HGX 的 Qwen FP16 是 4 个四卡副本，不是 5 个三卡副本',()=>{
    const e=run({modelId:'qwen3-235b',weightPrecision:'fp16',computePrecision:'fp16',unitCount:2},HGX)
    expect(e.feasible).toBe(true);expect(e.gpusPerReplica).toBe(4);expect(e.replicas).toBe(4)
    expect(e.allocation?.replicasPerDomain).toBe(2)
  })
  it('单域不适配，添加独立服务器仍然不适配',()=>{
    for(const unitCount of [1,2,64]) {
      const e=run({weightPrecision:'fp16',computePrecision:'fp16',cachedTokens:32000,inputTokens:512,outputTokens:256,batch:256,unitCount},HGX)
      expect(e.feasible).toBe(false);expect(e.replicas).toBe(0);expect(e.tokensPerSec).toBeNull()
    }
  })
  it('671B FP8 + MLA 默认负载：4 卡，MLA 不随 TP 平分',()=>{
    const e=run()
    const kvPerGpu=70272*4351*32/1e9
    const perGpu=671/4*1.1+2+kvPerGpu
    expect(e.gpusPerReplica).toBe(4);expect(e.replicas).toBe(18)
    expect(e.allocation?.peakPerGpuGB).toBeCloseTo(perGpu,10)
    expect(e.memory?.kvGB).toBeCloseTo(kvPerGpu*4,10)
    expect(perGpu).toBeLessThan(279*.9)
    expect(671/2*1.1+2+kvPerGpu).toBeGreaterThan(279*.9)
  })
  it('GQA 4 KV heads 在 TP8 上各复制一次；MLA 在全部 TP rank 上复制',()=>{
    const q=modelById('qwen3-235b')!,d=modelById('deepseek-v3')!
    const input={...DEFAULT_SCENARIO,batch:1}
    const fullQ=2*4*128*94*2*1000/1e9
    expect(kvGBPerGpu(q,input,4,1000)).toBeCloseTo(fullQ/4,12)
    expect(kvGBPerGpu(q,input,8,1000)).toBeCloseTo(fullQ/4,12)
    expect(kvGBPerGpu(d,input,8,1000)).toBeCloseTo(576*61*2*1000/1e9,12)
  })
  it('输出增长参与部署检查；显式 TP 无法靠切换服务器数绕过',()=>{
    const short=run({modelId:'llama3-70b',tensorParallel:1,batch:32,cachedTokens:0,inputTokens:512,outputTokens:1})
    const long=run({modelId:'llama3-70b',tensorParallel:1,batch:65,cachedTokens:0,inputTokens:512,outputTokens:7680,unitCount:64})
    expect(short.feasible).toBe(true);expect(long.feasible).toBe(false)
  })
  it('多个独立域只放大副本吞吐，单副本时延不变',()=>{
    const one=run(),two=run({unitCount:2})
    expect(two.tokensPerSec!.mid).toBeCloseTo(one.tokensPerSec!.mid*2,9)
    expect(two.tpotMs).toEqual(one.tpotMs)
  })
})

describe('算力精度与 decode 双约束',()=>{
  it.each([[GB,2500,5000,15000],[HGX,2250,4500,14000],[VR,4000,17500,35000]] as const)('%s 使用对应的 FP16 / FP8 / NVFP4 算力', (system,fp16,fp8,fp4)=>{
    const p=resolveHardwareProfile(system,'maxlps',FACTORY_PACK)!
    expect(p.math?.fp16Tflops).toBe(fp16);expect(p.math?.fp8Tflops).toBe(fp8);expect(p.math?.fp4Tflops).toBe(fp4)
    for(const [precision,flops] of [['fp16',fp16],['fp8',fp8],['nvfp4',fp4]] as const) {
      const e=run({computePrecision:precision},system)
      expect(e.ttftMs?.mid).toBeCloseTo(2*37e9*2048*32/(flops*1e12*4*.4)*1000,9)
    }
  })
  it('INT4 权重可显式配 FP16 计算；INT4 计算不借 NVFP4 算力',()=>{
    expect(run({weightPrecision:'int4',computePrecision:'fp16'}).kind).toBe('estimate')
    const e=run({computePrecision:'int4'})
    expect(e.kind).toBe('refused');expect(e.reasonCode).toBe('missing-dense-tflops')
  })
  it('MoE batch2 的独立均匀路由专家并集有独立手算',()=>{
    const d=modelById('deepseek-v3')!
    const e=expertCoverage(d,2)
    // E[X]=256*(1-(248/256)^2)=15.75. Expert B=(671-37)/(256-8).
    expect(e.expectedExperts).toBe(15.75)
    expect(e.expectedParamsB).toBeCloseTo(671-256*(634/248)+15.75*(634/248),10)
    expect(expertCoverage(d,1).expectedParamsB).toBeCloseTo(37,10)
    expect(expertCoverage(d,256).expectedParamsB).toBeLessThanOrEqual(671)
    expect(e.minParamsB).toBe(37);expect(e.maxParamsB).toBeGreaterThan(e.expectedParamsB)
  })
  it('decode memory 时间使用专家并集及每卡 KV，而非 batch 一份激活权重',()=>{
    const e=run()
    const covered=256*(1-(248/256)**32)
    const weights=671-256*(634/248)+covered*(634/248)
    const memoryMs=(weights/4+70272*4351*32/1e9)/(8*.6)
    expect(e.decode?.memoryMs).toBeCloseTo(memoryMs,9)
    expect(e.tpotMs?.mid).toBeCloseTo(Math.max(memoryMs,2*37e9*32/(5000e12*4*.4)*1000),9)
    expect(e.tokensPerSec?.mid).toBeCloseTo(32/e.tpotMs!.mid*1000*18,8)
  })
  it('低算力 GPU 的 decode 会被计算限制',()=>{
    const pack=structuredClone(FACTORY_PACK),gpu=pack.components.find(c=>c.id==='cmp.gb300.b300-gpu')!
    gpu.specs.fp8DenseTflops!.value=1
    const e=run({},GB,pack)
    expect(e.decode?.bottleneck).toBe('compute')
    expect(e.tpotMs!.mid).toBe(e.decode!.computeMs)
  })
  it('区间排序、免责声明和功率分母清晰',()=>{
    const e=run()
    for(const b of [e.ttftMs,e.tpotMs,e.tokensPerSec,e.tokensPerWatt]) {expect(b!.low).toBeLessThanOrEqual(b!.mid);expect(b!.mid).toBeLessThanOrEqual(b!.high)}
    expect(e.tokensPerWatt!.mid).toBeCloseTo(e.tokensPerSec!.mid/142000,10)
    expect(e.caveats[0]).toBe(CAPACITY_HEADLINE_CAVEAT)
    expect(run({},HGX).tokensPerWatt).toBeNull()
  })
})

describe('缺失与输入边界',()=>{
  it.each(['sys.rubin-ultra-nvl576','sys.groq3-lpx'])('%s 保持定性边界',id=>{const e=run({},id);expect(e.kind).toBe('refused');expect(e.tokensPerSec).toBeNull()})
  it('缺少 HBM / 算力 Claim 不能靠遗留 mathSpecs 出数',()=>{
    for(const key of ['hbmPerGpuGB','fp8DenseTflops']) {
      const pack=structuredClone(FACTORY_PACK),gpu=pack.components.find(c=>c.id==='cmp.gb300.b300-gpu')!
      gpu.specs[key]!.value=null
      expect(run({},GB,pack).kind).toBe('refused')
    }
  })
  it('未知 KV 一律拒绝可部署判断，不折算为零',()=>{
    const pack=structuredClone(FACTORY_PACK);pack.models[0]!.kvSpec={kind:'unsupported',note:'没有公开布局'}
    expect(run({},GB,pack).reasonCode).toBe('unsupported-kv')
  })
  it.each([0,-1,1.2,NaN,Infinity])('数量 %s 明确拒绝',unitCount=>expect(run({unitCount}).reasonCode).toBe('invalid-scenario'))
  it('上下文限制包含已有、输入和输出',()=>{
    expect(run({modelId:'llama3-70b',cachedTokens:4096,inputTokens:4096,outputTokens:1}).reasonCode).toBe('invalid-scenario')
    expect(run({modelId:'llama3-70b',cachedTokens:4095,inputTokens:4096,outputTokens:1}).reasonCode).not.toBe('invalid-scenario')
  })
  it('未知系统 / 模型，以及架构单位词保留',()=>{
    expect(run({},'bad').reasonCode).toBe('unknown-system')
    expect(run({modelId:'bad'}).reasonCode).toBe('unknown-model')
    expect(capacityUnitWordingFor(HGX).unitNoun).toBe('服务器')
    expect(capacityUnitWordingFor(GB).unitNoun).toBe('机架')
  })
})
