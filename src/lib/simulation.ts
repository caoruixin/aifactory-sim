import type { CapacityEstimate } from './capacity'
import { modelById } from '../data'
import { kvGBPerGpu } from './scenario'

export interface SimulationResult {
  phase: 'unavailable'|'prefill'|'decode'|'complete'
  generatedTokens: number
  generatedBatchTokens: number
  contextTokens: number
  kvPerGpuGB: number | null
  elapsedMs: number
  totalComputeMs: number | null
  layer: number | null
  layerOperation: string
  resourceAllocation: CapacityEstimate['allocation']
  bottleneck: string
  boundaries: string[]
}
/** Closed-form sum of max(compute, linearly growing memory time), no per-token array. */
export function decodeDuration(e:CapacityEstimate,n:number):number {
  const d=e.decode
  if(!d) return 0
  const total=Math.max(0,e.scenario.outputTokens-1)
  const delta=total<=1?0:(d.lastMemoryMs-d.firstMemoryMs)/(total-1)
  const count=Math.max(0,Math.min(total,Math.floor(n)))
  if(delta<=0) return count*Math.max(d.computeMs,d.firstMemoryMs)
  const computeSteps=Math.min(count,Math.max(0,Math.floor((d.computeMs-d.firstMemoryMs)/delta)+1))
  const memorySteps=count-computeSteps
  return computeSteps*d.computeMs + memorySteps*d.firstMemoryMs + delta*(count*(count-1)-computeSteps*(computeSteps-1))/2
}
export function simulationAt(e:CapacityEstimate,elapsedMs:number):SimulationResult {
  const model=modelById(e.modelId), s=e.scenario
  const base={generatedTokens:0,generatedBatchTokens:0,contextTokens:s.cachedTokens,kvPerGpuGB:null,
    elapsedMs:0,totalComputeMs:null,layer:null,layerOperation:'无法计算',resourceAllocation:e.allocation,
    bottleneck:'未确定',boundaries:e.caveats}
  if(!e.feasible || !e.ttftMs || !e.decode || !model) return {...base,phase:'unavailable'}
  const prefill=e.ttftMs.mid,total=prefill+decodeDuration(e,s.outputTokens-1)
  const time=Math.max(0,Math.min(total,Number.isFinite(elapsedMs)?elapsedMs:0))
  let tokens=0
  if(time>=prefill) {
    let low=0, high=s.outputTokens-1
    while(low<high) {const mid=Math.ceil((low+high)/2); if(decodeDuration(e,mid)<=time-prefill) low=mid;else high=mid-1}
    tokens=low+1
  }
  if(time>=total) tokens=s.outputTokens
  const phase=time>=total?'complete':time<prefill?'prefill':'decode'
  const fraction=phase==='prefill'?time/prefill:phase==='complete'?1:(time-prefill-decodeDuration(e,tokens-1))/(decodeDuration(e,tokens)-decodeDuration(e,tokens-1))
  const layers=model.kvSpec.kind==='unsupported'?1:model.kvSpec.numLayers
  const layer=Math.min(layers,Math.floor(fraction*layers)+1)
  const within=(fraction*layers)%1
  const operations=model.moe?['Attention / KV 更新','Router','激活分发','专家计算','激活合并']:['Attention / KV 更新','FFN']
  const context=s.cachedTokens+(phase==='prefill'?Math.floor(s.inputTokens*time/prefill):s.inputTokens+Math.max(0,tokens-1))
  return {phase,generatedTokens:tokens,generatedBatchTokens:tokens*s.batch,contextTokens:context,
    kvPerGpuGB:kvGBPerGpu(model,s,e.gpusPerReplica!,context),elapsedMs:time,totalComputeMs:total,
    layer,layerOperation:phase==='complete'?'输出完成':operations[Math.min(operations.length-1,Math.floor(within*operations.length))]!,
    resourceAllocation:e.allocation,bottleneck:phase==='prefill'?'计算（prefill 参数计算假设）':e.decode.bottleneck==='memory'?'显存带宽':'计算',
    boundaries:[...e.caveats,'层内步骤及 prefill KV 增长采用等比例教学展示，不是 kernel trace；请求入站/出站时延未知。']}
}
