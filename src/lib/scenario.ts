import type { Claim, FactoryContentPack, ModelSpec } from '../data/types'
import { gpuMathFromClaims } from '../data/resolvedMath'
import { RUBIN_PROFILES } from '../data/specifications'
import type { HardwareProfileId } from '../data/specifications'
import { kvBytesPerToken, QUANTS } from './roofline'
import type { QuantOption } from './roofline'

export interface ScenarioInput {
  modelId: string
  weightPrecision: QuantOption['id']
  computePrecision: 'fp16' | 'fp8' | 'nvfp4' | 'int4'
  kvPrecision: 'fp16' | 'fp8'
  cachedTokens: number
  inputTokens: number
  outputTokens: number
  batch: number
  unitCount: number
  tensorParallel: 'auto' | 1 | 2 | 4 | 8
  hardwareProfile: HardwareProfileId
}
export const DEFAULT_SCENARIO: ScenarioInput = {
  modelId: 'deepseek-v3', weightPrecision: 'fp8', computePrecision: 'fp8', kvPrecision: 'fp16',
  cachedTokens: 2048, inputTokens: 2048, outputTokens: 256, batch: 32, unitCount: 1,
  tensorParallel: 'auto', hardwareProfile: 'maxlps',
}
export const SCENARIO_PRESETS = [
  { id: 'light', label: '轻', values: { cachedTokens: 512, inputTokens: 512, outputTokens: 128, batch: 8 } },
  { id: 'medium', label: '中', values: { cachedTokens: 2048, inputTokens: 2048, outputTokens: 256, batch: 32 } },
  { id: 'heavy', label: '重', values: { cachedTokens: 24576, inputTokens: 8192, outputTokens: 1024, batch: 64 } },
] as const

export function scenarioErrors(s: ScenarioInput, model: ModelSpec | undefined): string[] {
  const errors: string[] = []
  if (!model) errors.push('模型不存在。')
  for (const [key, min, max] of [
    ['cachedTokens', 0, 1e7], ['inputTokens', 1, 1e7], ['outputTokens', 1, 1e7],
    ['batch', 1, 4096], ['unitCount', 1, 64],
  ] as const) if (!Number.isSafeInteger(s[key]) || s[key] < min || s[key] > max) errors.push(`${key} 必须为 ${min}–${max} 的整数。`)
  if (model && s.cachedTokens + s.inputTokens + s.outputTokens > model.contextK * 1024) {
    errors.push(`已有上下文 + 输入 + 输出不能超过 ${model.name} 的 ${model.contextK * 1024} token 上限。`)
  }
  if (!QUANTS.some(q => q.id === s.weightPrecision)) errors.push('权重精度无效。')
  if (!['fp16','fp8','nvfp4','int4'].includes(s.computePrecision)) errors.push('计算精度无效。')
  if (!['fp16','fp8'].includes(s.kvPrecision)) errors.push('KV 精度无效。')
  if (!['auto',1,2,4,8].includes(s.tensorParallel)) errors.push('TP 仅支持 auto / 1 / 2 / 4 / 8。')
  if (!(s.hardwareProfile in RUBIN_PROFILES)) errors.push('硬件规格配置无效。')
  return errors
}

export interface ResolvedHardwareProfile {
  id: HardwareProfileId
  label: string
  gpuId: string
  gpusPerDomain: number | null
  gpuSpecs: Record<string, Claim>
  systemSpecs: Record<string, Claim>
  math: ReturnType<typeof gpuMathFromClaims>
  claims: { label: string; claim: Claim }[]
}
export function resolveHardwareProfile(systemId: string, profile: HardwareProfileId, pack: FactoryContentPack): ResolvedHardwareProfile | null {
  const system = pack.systems.find(s => s.id === systemId)
  const gpu = pack.assemblies.filter(a => a.systemId === systemId).map(a => pack.components.find(c => c.id === a.componentId)).find(c => c?.kind === 'gpu')
  if (!system || !gpu) return null
  const variant = systemId === 'sys.vera-rubin-nvl72' ? RUBIN_PROFILES[profile] : null
  const gpuSpecs: Record<string, Claim> = { ...gpu.specs, ...variant?.gpu }
  const systemSpecs: Record<string, Claim> = { ...system.keySpecs, ...variant?.system }
  const count = systemSpecs.gpuCount?.value
  return { id: profile, label: variant?.label ?? '数据手册 · 当前 SKU', gpuId: gpu.id,
    gpusPerDomain: typeof count === 'number' && count > 0 ? count : null,
    gpuSpecs, systemSpecs, math: gpuMathFromClaims(gpuSpecs),
    claims: Object.entries(gpuSpecs).filter(([,c]) => typeof c.value === 'number').map(([label,claim]) => ({label,claim})),
  }
}

/** No context parallelism: GQA heads shard only as far as head count; MLA latent is replicated. */
export function kvShardDivisor(model: ModelSpec, tp: number): number {
  return model.kvSpec.kind === 'mha-gqa' ? Math.min(tp, model.kvSpec.kvHeads) : 1
}
export function kvGBPerGpu(model: ModelSpec, s: ScenarioInput, tp: number, context: number): number | null {
  const per = kvBytesPerToken(model.kvSpec, s.kvPrecision === 'fp8' ? 1 : 2)
  return per === null ? null : per * context * s.batch / kvShardDivisor(model,tp) / 1e9
}
export function expertCoverage(model: ModelSpec, batch: number) {
  if (!model.moe) return { expectedExperts: null, minParamsB: model.totalParamsB, expectedParamsB: model.totalParamsB, maxParamsB: model.totalParamsB }
  const {experts: e, activePerToken: k} = model.moe
  // Homogeneous routed experts; fixed parameters include attention, dense layers and shared experts.
  const expertB = (model.totalParamsB - model.activeParamsB) / (e-k)
  const fixedB = model.totalParamsB - e*expertB
  const expectedExperts = e*(1-Math.pow(1-k/e,batch))
  return { expectedExperts, minParamsB: model.activeParamsB,
    expectedParamsB: fixedB + expectedExperts*expertB,
    maxParamsB: fixedB + Math.min(e,batch*k)*expertB }
}

export function encodeScenario(s: ScenarioInput): string { return JSON.stringify({v:1,...s}) }
export function decodeScenario(raw: string | null): ScenarioInput | null {
  if (!raw || raw.length > 4096) return null
  try {
    const data = JSON.parse(raw)
    if (data.v !== 1) return null
    const result = Object.fromEntries(Object.keys(DEFAULT_SCENARIO).map(k => [k, data[k]])) as unknown as ScenarioInput
    // Model lookup and context limit validation happen before calculation; reject malformed transport here.
    if (typeof result.modelId !== 'string' || !result.modelId) return null
    if (scenarioErrors(result, { contextK: 1e9, name: '', } as ModelSpec).length) return null
    return result
  } catch { return null }
}
