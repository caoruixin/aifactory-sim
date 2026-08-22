/**
 * 系统级 token 产能**粗估**（纯函数，零 three 导入）。
 *
 * 这一层做的事只有一件：把 `roofline.ts` 的单卡数学，按内容包里的**官方**系统参数
 * （GPU 数量、机架功率）放大到「一个机架/一组机架能出多少 token」的量级感，
 * 并且在任何一处官方数据缺失时**明确拒绝出数**而不是编一个看起来很像的数字。
 *
 * ★ 三条不可让步的规则
 * 1. **不存在「峰值 FLOPS → tokens/s」的直接换算路径**。吞吐只能从 decode 步长
 *    （带宽瓶颈）推导；prefill 只影响 TTFT。谁要是想「1080 PFLOPS ÷ 每 token FLOPs」
 *    得出一个漂亮数字，那个数字与真实服务能力没有任何关系。
 * 2. **拒绝门按序执行**（forecast 系统 → GPU 官方数学参数缺失 → KV 口径未知），
 *    命中即降级，绝不用分析师估算或作者记忆补齐。
 * 3. `caveats` 恒非空，且**首条固定**是「这是粗估区间，不是可承诺产能」。
 *    UI 无论怎么排版都必须把它显示出来。
 *
 * 不做（二期再说）：goodput/SLA、成本/TCO、跨机架张量并行、chunked prefill、
 * 投机解码、MoE 专家并行的通信建模。
 */

import { FACTORY_PACK, modelById, systemById } from '../data'
import type { Claim, EvidenceType, FactoryContentPack, HardwareComponent, ModelSpec } from '../data/types'
import {
  DEFAULT_MBU,
  DEFAULT_MFU,
  QUANTS,
  estStepMs,
  estTTFTms,
  kvBytesPerToken,
  memoryBreakdown,
  minGpus,
  tflopsForQuant,
  tokensPerSecond,
} from './roofline'
import type { MemoryBreakdown, QuantOption } from './roofline'

/** id → 量化选项（`QUANTS` 是数组，这里建一次索引）。 */
const QUANT_BY_ID: Record<string, QuantOption | undefined> = Object.fromEntries(
  QUANTS.map((q) => [q.id, q]),
)

// ─────────────────────────── 区间与输入 ───────────────────────────

/**
 * 低/中/高三档估算。
 *
 * ⚠️ 语义是「数值的大小」而不是「好坏」：对**时延**（TTFT/TPOT）来说 `low` 是最好的情况
 * （高利用率 ⇒ 低时延），对**吞吐**来说 `high` 才是最好的情况。UI 上必须标注方向，
 * 否则会被读成「TTFT 高档 = 更强」。
 */
export interface Band {
  low: number
  mid: number
  high: number
}

/** MFU（算力利用率）三档；mid 与 `roofline.DEFAULT_MFU` 一致。 */
export const MFU_BAND = { low: 0.3, mid: DEFAULT_MFU, high: 0.5 } as const
/** MBU（显存带宽利用率）三档；mid 与 `roofline.DEFAULT_MBU` 一致。 */
export const MBU_BAND = { low: 0.5, mid: DEFAULT_MBU, high: 0.7 } as const

export interface CapacityWorkload {
  /** 单请求输入长度（决定 TTFT）。 */
  promptTokens: number
  /** 平均上下文长度（决定 KV cache 占用与 decode 步长）。 */
  avgContextTokens: number
  /** 单副本并发批大小。 */
  batchPerReplica: number
}

/** 默认「中等负载」：一次多轮对话量级的输入 + 中等并发。 */
export const DEFAULT_WORKLOAD: CapacityWorkload = {
  promptTokens: 2048,
  avgContextTokens: 4096,
  batchPerReplica: 32,
}

export interface CapacityInput {
  systemId: string
  /** 参与估算的机架数（>1 时只做数据并行副本线性外推，见 caveat）。 */
  rackCount?: number
  modelId: string
  quantId: QuantOption['id']
  workload?: CapacityWorkload
}

// ─────────────────────────── 输出 ───────────────────────────

export interface CapacityInputClaim {
  label: string
  claim: Claim
}

/**
 * 估算结果自身的证据定级：**恒为 `author_opinion`**。
 * 它是本项目的推导，不是任何厂商或分析师发布过的数字；
 * `inputClaims` 列出推导消耗掉的那几条官方 Claim，便于逐条回查。
 */
export interface CapacityEvidence {
  evidence: EvidenceType
  method: string
  inputClaims: CapacityInputClaim[]
}

export interface CapacityEstimate {
  kind: 'estimate' | 'refused'
  systemId: string
  systemName: string
  modelId: string
  quantId: QuantOption['id']
  rackCount: number
  workload: CapacityWorkload
  /** 拒绝原因（kind==='refused' 时非空）。 */
  reason: string | null
  /** 点名缺失的官方数据项；UI 直接列出来告诉用户「差什么才能算」。 */
  missing: string[]
  /** 至少能放下一个副本。 */
  feasible: boolean
  /** 单副本所需 GPU 数（按显存下限）。 */
  gpusPerReplica: number | null
  replicas: number | null
  /** 参与估算的 GPU 总数 = 每机架 GPU 数 × rackCount。 */
  totalGpus: number | null
  memory: MemoryBreakdown | null
  /** 算力口径（FP16 没有官方字段，会回退到 FP8 口径并在 caveat 里说明）。 */
  basis: 'fp8' | 'fp4' | null
  ttftMs: Band | null
  tpotMs: Band | null
  tokensPerSec: Band | null
  /** tokens/s ÷ 瓦特（= tokens/焦耳）。系统未公布机架功率时为 null。 */
  tokensPerWatt: Band | null
  caveats: string[]
  evidence: CapacityEvidence
}

/** caveats 的固定首条。UI 与测试都引用这个常量，不要各写各的。 */
export const CAPACITY_HEADLINE_CAVEAT =
  '粗估区间（roofline 示意），非实测/可承诺产能：只建模「prefill 吃算力、decode 吃显存带宽」两条主线。'

const METHOD_CAVEAT =
  `区间来自利用率假设：MFU ${MFU_BAND.low}/${MFU_BAND.mid}/${MFU_BAND.high}（影响 TTFT）、` +
  `MBU ${MBU_BAND.low}/${MBU_BAND.mid}/${MBU_BAND.high}（影响 TPOT 与吞吐）。时延区间方向相反：low = 高利用率 = 更快。`

const NOT_MODELED_CAVEAT =
  '未建模：集合通信开销、流水气泡、chunked prefill、投机解码、调度与排队、goodput/SLA、成本。'

// ─────────────────────────── 内部工具 ───────────────────────────

type GpuComponent = Extract<HardwareComponent, { kind: 'gpu' }>

function bandOf(low: number, mid: number, high: number): Band {
  return { low, mid, high }
}

/** 系统装配树里第一个 kind==='gpu' 的组件（按内容包声明顺序，确定性）。 */
function gpuComponentOf(systemId: string, pack: FactoryContentPack): GpuComponent | null {
  const byId = new Map(pack.components.map((c) => [c.id, c]))
  for (const a of pack.assemblies) {
    if (a.systemId !== systemId) continue
    const c = byId.get(a.componentId)
    if (c && c.kind === 'gpu') return c
  }
  return null
}

/** roofline 用到的那几条官方 Claim（GPU 规格表里能对上的键），用于 evidence.inputClaims。 */
const MATH_BACKING_SPEC_KEYS = [
  'hbmPerGpuGB',
  'hbm4PerGpuGB',
  'memoryBandwidthTBs',
  'fp4DenseTflopsPerGpu',
  'fp8DenseTflopsPerGpu',
] as const

function refusal(
  base: Omit<CapacityEstimate, 'kind' | 'reason' | 'missing' | 'caveats'>,
  reason: string,
  missing: string[],
): CapacityEstimate {
  return {
    ...base,
    kind: 'refused',
    reason,
    missing,
    feasible: false,
    gpusPerReplica: null,
    replicas: null,
    totalGpus: base.totalGpus,
    memory: null,
    basis: null,
    ttftMs: null,
    tpotMs: null,
    tokensPerSec: null,
    tokensPerWatt: null,
    caveats: [CAPACITY_HEADLINE_CAVEAT, reason, ...missing.map((m) => `缺失的官方数据：${m}`)],
  }
}

// ─────────────────────────── 主函数 ───────────────────────────

/**
 * 产能粗估。三道拒绝门按序：
 *   1. `forecast` 系统（如 Rubin Ultra NVL576，全部数据来自分析师）→ **永不出数**；
 *   2. GPU 的 `mathSpecs` 为 null 或关键字段缺失（如 Vera Rubin 的 HBM4 官方未公布）
 *      → 拒绝并点名缺什么；
 *   3. 模型 KV 口径 `unsupported` → TPOT/吞吐降级为 null（TTFT 仍可出，prefill 不依赖 KV）。
 */
export function estimateSystemCapacity(
  input: CapacityInput,
  pack: FactoryContentPack = FACTORY_PACK,
): CapacityEstimate {
  const rackCount = Math.max(1, Math.floor(input.rackCount ?? 1))
  const workload = input.workload ?? DEFAULT_WORKLOAD
  const usePack = pack === FACTORY_PACK
  const system = usePack ? systemById(input.systemId) : pack.systems.find((s) => s.id === input.systemId)
  const model: ModelSpec | undefined = usePack
    ? modelById(input.modelId)
    : pack.models.find((m) => m.id === input.modelId)
  const quant = QUANT_BY_ID[input.quantId]

  const base = {
    systemId: input.systemId,
    systemName: system?.name ?? input.systemId,
    modelId: input.modelId,
    quantId: input.quantId,
    rackCount,
    workload,
    feasible: false,
    gpusPerReplica: null,
    replicas: null,
    totalGpus: null,
    memory: null,
    basis: null,
    ttftMs: null,
    tpotMs: null,
    tokensPerSec: null,
    tokensPerWatt: null,
    evidence: {
      evidence: 'author_opinion' as const,
      method:
        'prefill：FLOPs ≈ 2 × 激活参数 × prompt tokens ÷ (稠密算力 × MFU)；' +
        'decode：每步读一遍激活权重 + batch 份 KV ÷ (显存带宽 × MBU)；' +
        '副本数 = floor(GPU 总数 ÷ 单副本最少 GPU 数)。',
      inputClaims: [] as CapacityInputClaim[],
    },
  } satisfies Omit<CapacityEstimate, 'kind' | 'reason' | 'missing' | 'caveats'>

  if (!system) {
    return refusal(base, `内容包中没有系统 ${input.systemId}。`, ['系统定义'])
  }
  if (!model) {
    return refusal({ ...base }, `内容包中没有模型 ${input.modelId}。`, ['模型定义'])
  }
  if (!quant) {
    return refusal({ ...base }, `未知的量化口径 ${input.quantId}。`, ['量化口径'])
  }

  // ── 拒绝门 1：forecast 系统永不出数 ──
  if (system.status === 'forecast') {
    return refusal(
      base,
      `${system.name} 是预测（forecast）阶段的系统，其架构数据来自第三方分析师而非厂商规格表——本工具对它一律不出产能数字。`,
      ['NVIDIA 官方发布的规格表（GPU 显存/带宽/算力、机架功率）'],
    )
  }

  const gpu = gpuComponentOf(system.id, pack)
  if (!gpu) {
    return refusal(base, `${system.name} 的装配树里没有 GPU 组件。`, ['GPU 组件定义'])
  }

  // ── 消耗掉的官方 Claim（先收集，拒绝时也能显示「已有哪些」） ──
  const inputClaims: CapacityInputClaim[] = []
  const gpuCountClaim = system.keySpecs.gpuCount
  if (gpuCountClaim) inputClaims.push({ label: `${system.name} 每机架 GPU 数`, claim: gpuCountClaim })
  const powerClaim = system.keySpecs.rackPowerKW
  if (powerClaim) inputClaims.push({ label: `${system.name} 整机架功率`, claim: powerClaim })
  for (const key of MATH_BACKING_SPEC_KEYS) {
    const c = gpu.specs[key]
    if (c && c.value !== null) inputClaims.push({ label: `${gpu.name} · ${key}`, claim: c })
  }
  const withEvidence = { ...base, evidence: { ...base.evidence, inputClaims } }

  // ── 拒绝门 2：GPU 的官方数学参数缺失 ──
  const math = gpu.mathSpecs
  if (math === null) {
    return refusal(
      withEvidence,
      `${gpu.name} 的官方数学参数尚未公布，因此不能算产能——本工具不会用分析师估算或记忆里的数字替代。`,
      [
        `${gpu.name} 单卡 HBM 容量（GB）`,
        `${gpu.name} 单卡显存带宽（TB/s）`,
        `${gpu.name} 单卡稠密算力（FP8 / FP4 TFLOPS）`,
      ],
    )
  }

  const gpuCount = typeof gpuCountClaim?.value === 'number' ? gpuCountClaim.value : null
  if (gpuCount === null) {
    return refusal(withEvidence, `${system.name} 未公布每机架 GPU 数量。`, [
      `${system.name} keySpecs.gpuCount`,
    ])
  }

  const { tflops, basis } = tflopsForQuant(math, input.quantId)
  if (tflops === null) {
    return refusal(
      withEvidence,
      `${gpu.name} 的稠密算力官方未公布（FP8 与 FP4 两个口径都没有），TTFT 无从估算。`,
      [`${gpu.name} 稠密算力（FP8 / FP4 TFLOPS）`],
    )
  }

  const totalGpus = gpuCount * rackCount
  const caveats: string[] = [CAPACITY_HEADLINE_CAVEAT, METHOD_CAVEAT]

  if (basis === 'fp8' && input.quantId !== 'fp8') {
    caveats.push(
      `所选量化为 ${quant.label}，但数据层只有官方 FP8/FP4 两档算力口径，算力按 FP8 稠密值计（显存仍按 ${quant.bytesPerParam} 字节/参数）。`,
    )
  }

  // ── 显存与副本数 ──
  const mem = memoryBreakdown(
    model.totalParamsB,
    quant.bytesPerParam,
    model.kvSpec,
    workload.avgContextTokens,
    workload.batchPerReplica,
  )
  const kvKnown = mem.kvGB !== null
  // ── 拒绝门 3：KV 口径未知 → 只降级不编数 ──
  if (!kvKnown) {
    caveats.push(
      `${model.name} 的 KV cache 口径没有可靠公开参数（${model.kvSpec.kind === 'unsupported' ? model.kvSpec.note : '未知'}），` +
        'decode 步长与吞吐一律不出数；下面的单副本 GPU 数只按「权重 + 运行开销」的下限算，实际必然更多。',
    )
  }
  const sizingGB = mem.totalGB ?? mem.weightsGB + mem.overheadGB
  const gpusPerReplica = minGpus(sizingGB, math.memoryGB)
  const replicas = Math.floor(totalGpus / gpusPerReplica)
  const feasible = replicas >= 1

  if (rackCount > 1) {
    caveats.push(
      `${rackCount} 个机架按**数据并行副本**线性外推（每个副本仍在单机架 NVLink 域内），` +
        '没有建模跨机架张量/专家并行的通信代价——真实多机架吞吐会低于线性值。',
    )
  }

  if (!feasible) {
    caveats.push(
      `按 ${quant.label} 与当前上下文，单副本至少需要 ${gpusPerReplica} 张 GPU，` +
        `超过了参与估算的 ${totalGpus} 张——该配置放不下这个模型，需要增加机架数或换更激进的量化。`,
    )
  }

  // ── 时延与吞吐（时延区间方向相反：高利用率 = 低时延） ──
  const ttft = feasible
    ? bandOf(
        estTTFTms(model.activeParamsB, workload.promptTokens, tflops, gpusPerReplica, MFU_BAND.high)!,
        estTTFTms(model.activeParamsB, workload.promptTokens, tflops, gpusPerReplica, MFU_BAND.mid)!,
        estTTFTms(model.activeParamsB, workload.promptTokens, tflops, gpusPerReplica, MFU_BAND.low)!,
      )
    : null

  const kvPerToken = kvBytesPerToken(model.kvSpec)
  const stepAt = (mbu: number): number | null =>
    estStepMs(
      model.activeParamsB,
      quant.bytesPerParam,
      kvPerToken,
      workload.avgContextTokens,
      workload.batchPerReplica,
      math.bandwidthTBs,
      gpusPerReplica,
      mbu,
    )

  const stepFast = stepAt(MBU_BAND.high)
  const stepMid = stepAt(MBU_BAND.mid)
  const stepSlow = stepAt(MBU_BAND.low)

  const tpot =
    feasible && stepFast !== null && stepMid !== null && stepSlow !== null
      ? bandOf(stepFast, stepMid, stepSlow)
      : null

  const throughput = (stepMs: number | null): number | null => {
    const perReplica = tokensPerSecond(stepMs, workload.batchPerReplica)
    return perReplica === null ? null : perReplica * replicas
  }
  const tpsHigh = throughput(stepFast)
  const tpsMid = throughput(stepMid)
  const tpsLow = throughput(stepSlow)
  const tokensPerSec =
    feasible && tpsLow !== null && tpsMid !== null && tpsHigh !== null
      ? bandOf(tpsLow, tpsMid, tpsHigh)
      : null

  // ── tokens/W ──
  const rackPowerKW = typeof powerClaim?.value === 'number' ? powerClaim.value : null
  let tokensPerWatt: Band | null = null
  if (rackPowerKW === null) {
    caveats.push(
      `${system.name} 未公布整机架功率（keySpecs.rackPowerKW 为「官方未公布」），tokens/W 不出数。`,
    )
  } else if (tokensPerSec !== null) {
    const watts = rackPowerKW * 1000 * rackCount
    tokensPerWatt = bandOf(tokensPerSec.low / watts, tokensPerSec.mid / watts, tokensPerSec.high / watts)
    caveats.push(
      `tokens/W 用官方机架功率 ${rackPowerKW} kW（${powerClaim?.note?.includes('up to') ? '「最高」口径，不是典型工况' : '官方口径'}）` +
        '× 机架数，未计入 CDU、机架外交换机与机房 PUE。',
    )
  }

  caveats.push(NOT_MODELED_CAVEAT)

  return {
    ...withEvidence,
    kind: 'estimate',
    reason: null,
    missing: [],
    feasible,
    gpusPerReplica,
    replicas,
    totalGpus,
    memory: mem,
    basis,
    ttftMs: ttft,
    tpotMs: tpot,
    tokensPerSec,
    tokensPerWatt,
    caveats,
  }
}

/** 便捷封装：默认模型 + 默认负载，只关心「换代际/换机架数」时用。 */
export function quickCapacity(
  systemId: string,
  modelId: string,
  quantId: QuantOption['id'] = 'fp8',
  rackCount = 1,
): CapacityEstimate {
  return estimateSystemCapacity({ systemId, modelId, quantId, rackCount })
}

/** 组件是否被产能估算当作「有官方数学参数」——UI 上给 GPU 详情用。 */
export function hasMathSpecs(component: HardwareComponent | undefined): boolean {
  return component?.kind === 'gpu' && component.mathSpecs !== null
}
