/**
 * Roofline 纯函数引擎：显存与性能的**简化估算**。
 *
 * ⚠️ 本文件产出的所有性能数字都是 roofline 示意估算，仅供教学与量级感知，
 *    既非实测 benchmark，也不能作为可承诺产能对外报出：
 *    - prefill 视为**算力瓶颈**：FLOPs ≈ 2 × 激活参数 × prompt tokens，除以 (算力 × MFU)
 *    - decode 视为**带宽瓶颈**：每步读一遍激活权重（batch 内共享）+ 各请求各自的 KV，
 *      除以 (显存带宽 × MBU)
 *    - MFU/MBU 取保守经验值；真实系统受 kernel、并行切分、调度与 batching 策略影响上下浮动
 *    - 不建模：通信开销、流水气泡、投机解码、chunked prefill、goodput/SLA
 *
 * null 传播纪律（本项目从第一天起就是对的）：任何未知输入都必须让结果变成 null，
 * **绝不允许把 null 当 0**——把未知 KV 当 0 会让长上下文吞吐虚高数倍。
 * 参考实现 llms-study/src/lib/simEngine.ts 的 `estStepMs` 在 KV 为 null 时按 0 计算，
 * 是一个已确认的 bug，本移植版已修正为返回 null。
 */
import type { KVSpec } from '../data/types'

export interface QuantOption {
  id: 'fp16' | 'fp8' | 'int4'
  label: string
  bytesPerParam: number
}

export const QUANTS: QuantOption[] = [
  { id: 'fp16', label: 'FP16/BF16', bytesPerParam: 2 },
  { id: 'fp8', label: 'FP8', bytesPerParam: 1 },
  { id: 'int4', label: 'INT4/FP4', bytesPerParam: 0.5 },
]

export const DEFAULT_MFU = 0.4 // prefill 算力利用率（经验值）
export const DEFAULT_MBU = 0.6 // decode 带宽利用率（经验值）

const KV_BYTES = 2 // KV 按 FP16 存储

/** 权重显存：参数量(B) × 每参数字节 = GB（1e9 × bytes ÷ 1e9）。 */
export function weightMemoryGB(totalParamsB: number, bytesPerParam: number): number {
  return totalParamsB * bytesPerParam
}

/**
 * 每 token 全层合计的 KV 字节数。
 * 新型稀疏/线性注意力无公开参数时返回 null（不做伪精确估算）。
 */
export function kvBytesPerToken(kv: KVSpec): number | null {
  switch (kv.kind) {
    case 'mha-gqa':
      return 2 * kv.kvHeads * kv.headDim * kv.numLayers * KV_BYTES
    case 'mla':
      // MLA 只缓存压缩后的 latent（如 DeepSeek 512+64=576 维），没有 K/V 两份
      return kv.kvLatentDim * kv.numLayers * KV_BYTES
    case 'unsupported':
      return null
  }
}

export function kvCacheGB(kv: KVSpec, contextTokens: number, batch: number): number | null {
  const per = kvBytesPerToken(kv)
  if (per === null) return null
  return (per * contextTokens * batch) / 1e9
}

export interface MemoryBreakdown {
  weightsGB: number
  kvGB: number | null
  overheadGB: number
  totalGB: number | null
}

/** 开销：激活/运行时/碎片，简化为权重的 10% + 2GB。 */
export function memoryBreakdown(
  totalParamsB: number,
  bytesPerParam: number,
  kv: KVSpec,
  contextTokens: number,
  batch: number,
): MemoryBreakdown {
  const weightsGB = weightMemoryGB(totalParamsB, bytesPerParam)
  const kvGB = kvCacheGB(kv, contextTokens, batch)
  const overheadGB = weightsGB * 0.1 + 2
  return {
    weightsGB,
    kvGB,
    overheadGB,
    totalGB: kvGB === null ? null : weightsGB + kvGB + overheadGB,
  }
}

/** 最少 GPU 数（默认只按 90% 显存可用，留服务余量）。 */
export function minGpus(totalGB: number, gpuMemoryGB: number, usable = 0.9): number {
  return Math.max(1, Math.ceil(totalGB / (gpuMemoryGB * usable)))
}

/**
 * 按所选量化取 GPU 算力口径：仅在官方公布了对应精度算力时切换（INT4/FP4 → fp4Tflops），
 * 其余（含 FP16——数据层没有官方 FP16 字段）回退 FP8 口径，`basis` 供 UI 标注「按 FP8 算力口径」。
 * 不编造硬件数字：GPU 两个字段都为 null 时原样透传 null。
 */
export function tflopsForQuant(
  gpu: { fp8Tflops: number | null; fp4Tflops: number | null },
  quantId: QuantOption['id'],
): { tflops: number | null; basis: 'fp8' | 'fp4' } {
  if (quantId === 'int4' && gpu.fp4Tflops !== null) return { tflops: gpu.fp4Tflops, basis: 'fp4' }
  return { tflops: gpu.fp8Tflops, basis: 'fp8' }
}

/** TTFT 估算（ms）：prefill FLOPs ≈ 2 × 激活参数 × prompt tokens。算力未知 → null。 */
export function estTTFTms(
  activeParamsB: number,
  promptTokens: number,
  gpuTflops: number | null,
  gpuCount: number,
  mfu = DEFAULT_MFU,
): number | null {
  if (gpuTflops === null) return null
  const flops = 2 * activeParamsB * 1e9 * promptTokens
  return (flops / (gpuTflops * 1e12 * gpuCount * mfu)) * 1000
}

/**
 * 每个 decode 步的时长（ms）：读一遍激活权重（batch 内共享）+ batch 份 KV。
 *
 * ★ null 语义（与参考实现的关键差异）：`kvPerTokenBytes === null` 时**一律返回 null**，
 *   即使 `contextTokens === 0` 也返回 null。理由是语义统一——「KV 口径未知 ⇒ 不估算」，
 *   而不是「这次恰好算得出所以给个数」。调用方拿到 null 应显示 N/A 并说明缺失哪项官方数据。
 */
export function estStepMs(
  activeParamsB: number,
  bytesPerParam: number,
  kvPerTokenBytes: number | null,
  contextTokens: number,
  batch: number,
  bandwidthTBs: number,
  gpuCount: number,
  mbu = DEFAULT_MBU,
): number | null {
  if (kvPerTokenBytes === null) return null
  const weightBytes = activeParamsB * 1e9 * bytesPerParam
  const kvBytes = kvPerTokenBytes * contextTokens * batch
  return ((weightBytes + kvBytes) / (bandwidthTBs * 1e12 * gpuCount * mbu)) * 1000
}

/** 集群总吞吐 tokens/s：每步产出 batch 个 token。步长未知 → null。 */
export function tokensPerSecond(stepMs: number | null, batch: number): number | null {
  if (stepMs === null) return null
  return (batch / stepMs) * 1000
}
