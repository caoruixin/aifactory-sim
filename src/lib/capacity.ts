/**
 * 教学用计算时间 / 吞吐估算，纯函数。规格来自带出处的 Claim。
 * 单个副本只使用一个 NVLink 域内的合法 TP=1/2/4/8；decode 取算力与显存带宽约束的较大值。
 * 未知规格、无法部署与仅可定性演示的系统明确拒绝出数；不推导端到端 TTFT 或生产服务能力。
 * 通信、调度、排队、attention 额外 FLOPs、投机解码及成本不在模型范围内。
 */

import { DEFAULT_SCENARIO, resolveHardwareProfile, scenarioErrors, kvGBPerGpu, expertCoverage } from './scenario'
import type { ScenarioInput } from './scenario'
import { FACTORY_PACK, modelById, systemById } from '../data'
import type {
  Claim,
  EvidenceType,
  FactoryContentPack,
  FactorySystem,
  HardwareComponent,
  ModelSpec,
} from '../data/types'
import {
  DEFAULT_MBU,
  DEFAULT_MFU,
  QUANTS,
  estTTFTms,
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
  scenario?: ScenarioInput
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

/**
 * 拒绝原因的**稳定机读码**（v1.3 新增）——`reason` 是给人看的句子，会随文案调整措辞；
 * UI 与测试要按「为什么拒绝」分支渲染/断言时，一律认这个字段，不要用 `reason.includes(...)`
 * 做业务判断（那是给人看的兜底展示用的）。
 */
export type CapacityRefusalReasonCode =
  | 'invalid-scenario'
  | 'unsupported-kv'
  | 'unknown-system'
  | 'unknown-model'
  | 'unknown-quant'
  | 'analyst-modeled-policy'
  | 'paired-only-policy'
  | 'forecast-status'
  | 'missing-gpu-component'
  | 'missing-math-specs'
  | 'missing-gpu-count'
  | 'missing-dense-tflops'

export interface CapacityEstimate {
  kind: 'estimate' | 'refused'
  systemId: string
  systemName: string
  modelId: string
  quantId: QuantOption['id']
  rackCount: number
  workload: CapacityWorkload
  /** 拒绝原因（kind==='refused' 时非空）。给人看的句子，措辞可能变化。 */
  reason: string | null
  /** 拒绝原因的稳定机读码（kind==='refused' 时非空），见 `CapacityRefusalReasonCode`。 */
  reasonCode: CapacityRefusalReasonCode | null
  /**
   * 点名缺失的官方数据项；UI 直接列出来告诉用户「差什么才能算」。
   * ⚠️ `capacityPolicy` 驱动的策略性拒绝（analyst-modeled / paired-only）恒为空数组——
   * 那不是「差一个数」，是「口径本身不够硬/语义不适用」，UI 不得渲染缺数据文案。
   */
  missing: string[]
  /** 至少能放下一个副本。 */
  feasible: boolean
  /** 单副本所需 GPU 数（按显存下限）。 */
  gpusPerReplica: number | null
  replicas: number | null
  /** 参与估算的 GPU 总数 = 每机架 GPU 数 × rackCount。 */
  totalGpus: number | null
  memory: MemoryBreakdown | null
  /** 与所选计算精度匹配的稠密算力口径；不跨精度回退。 */
  basis: 'fp16' | 'fp8' | 'fp4' | null
  ttftMs: Band | null
  tpotMs: Band | null
  tokensPerSec: Band | null
  /** tokens/s ÷ 瓦特（= tokens/焦耳）。系统未公布机架功率时为 null。 */
  tokensPerWatt: Band | null
  caveats: string[]
  evidence: CapacityEvidence
  scenario: ScenarioInput
  allocation: { domains: number; gpusPerDomain: number; replicasPerDomain: number; idleGpus: number; peakPerGpuGB: number; kvPerGpuGB: number; kvDivisor: number } | null
  decode: { computeMs: number; memoryMs: number; firstMemoryMs: number; lastMemoryMs: number; firstStepMs: number; lastStepMs: number; bottleneck: 'compute' | 'memory'; expectedWeightParamsB: number; minWeightParamsB: number; maxWeightParamsB: number; expectedExperts: number | null } | null
}

/** caveats 的固定首条。UI 与测试都引用这个常量，不要各写各的。 */
export const CAPACITY_HEADLINE_CAVEAT =
  '计算时间 / 吞吐估算，非实测或端到端 TTFT；不含通信、排队和调度。MFU 30–50%，MBU 50–70%。'

const METHOD_CAVEAT =
  `区间来自利用率假设：MFU ${MFU_BAND.low}/${MFU_BAND.mid}/${MFU_BAND.high}（影响 prefill / decode 计算）、` +
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
  'fp8DenseTflops',
  'fp16DenseTflops',
  'fp4DenseTflops',
  'hbmBandwidthTBs',
] as const

function refusal(
  base: Omit<CapacityEstimate, 'kind' | 'reason' | 'reasonCode' | 'missing' | 'caveats'>,
  reason: string,
  missing: string[],
  reasonCode: CapacityRefusalReasonCode,
): CapacityEstimate {
  return {
    ...base,
    kind: 'refused',
    reason,
    reasonCode,
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

// ─────────────────────────── 产能单位措辞（按域架构分型） ───────────────────────────

/**
 * 产能外推单位的显示措辞（v1.4 W-C QA 返工点 1）。
 *
 * `keySpecs.gpuCount` 在不同域架构下计的**不是同一种单位**：
 *   - `nvlink-rack-domain`（GB300 / Vera Rubin / NVL576）：一个机架就是一台机器，
 *     单位是「机架」——沿用历来措辞；
 *   - `nvlink-node-domain`（HGX B300）：NVLink 域止步单服务器，gpuCount=8 是
 *     **每台服务器**口径（每机架装几台由客户机房功率决定，官方刻意不给数，
 *     见 hgx-b300.ts 的 SERVERS_PER_RACK note）。把它渲染成「每机架 GPU 数」
 *     会与「机架里没有 NVLink」的教学主线正面冲突，还把错误口径贴进
 *     「用到的官方数据」证据溯源区。
 *
 * 与 `planeLabel` 同理：纯展示层措辞、不建 Claim；键（keySpecs.gpuCount /
 * rackCount 入参名）保持不变，只有给人看的名字按架构变。数据层 note 已写明读法，
 * 这里是它在 UI 的唯一出口。
 */
export interface CapacityUnitWording {
  /** 单位名（不带量词），用于 `×N 机架` / `×N 服务器` 后缀。 */
  unitNoun: string
  /** 量词（「个」/「台」），用于 `8 个机架` / `8 台服务器` 这类句子。 */
  measure: string
  /** 数量输入框与「增加……」句式的标签（「机架数」/「服务器台数」）。 */
  counterLabel: string
  /** `keySpecs.gpuCount` 的证据/文案标签。 */
  perUnitGpuLabel: string
  /** `keySpecs.rackPowerKW` 的证据/文案标签。 */
  unitPowerLabel: string
  /** 多单位线性外推 caveat 里「每个副本仍在……」的域范围说法。 */
  replicaScope: string
}

const RACK_UNIT_WORDING: CapacityUnitWording = {
  unitNoun: '机架',
  measure: '个',
  counterLabel: '机架数',
  perUnitGpuLabel: '每机架 GPU 数',
  unitPowerLabel: '整机架功率',
  replicaScope: '单机架 NVLink 域内',
}

const NODE_UNIT_WORDING: CapacityUnitWording = {
  unitNoun: '服务器',
  measure: '台',
  counterLabel: '服务器台数',
  perUnitGpuLabel: '每台服务器 GPU 数',
  unitPowerLabel: '单台服务器整机功率',
  replicaScope: '单台服务器的 NVLink 域内',
}

/** 按域架构取产能单位措辞；未知架构回落到「机架」（对旧数据总是安全的）。 */
export function capacityUnitWording(
  architecture: FactorySystem['architecture'] | null | undefined,
): CapacityUnitWording {
  return architecture === 'nvlink-node-domain' ? NODE_UNIT_WORDING : RACK_UNIT_WORDING
}

/** 便捷封装：按系统 ID 取单位措辞（UI 组件用）。 */
export function capacityUnitWordingFor(
  systemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): CapacityUnitWording {
  const system = pack === FACTORY_PACK ? systemById(systemId) : pack.systems.find((s) => s.id === systemId)
  return capacityUnitWording(system?.architecture)
}

/**
 * 产能粗估。拒绝门按序：
 *   1. `capacityPolicy !== 'standard'`（`analyst-modeled`：如 Rubin Ultra NVL576，
 *      已官宣但结构主要来自第三方分析师；`paired-only`：只在配对系统里有产能语义）
 *      → **永不出数**，`missing` 恒为空数组；
 *   2. 从当前规格 Claim 派生的数学参数缺失
 *      → 拒绝并点名缺什么；
 *   3. 模型 KV 口径 `unsupported` → 无法判定显存可部署，拒绝出数。
 * 每个拒绝分支都带一个稳定的 `reasonCode`（见 `CapacityRefusalReasonCode`），
 * UI 按它分支渲染，不要用 `reason` 文本做业务判断。
 */
export function estimateSystemCapacity(
  input: CapacityInput,
  pack: FactoryContentPack = FACTORY_PACK,
): CapacityEstimate {
  const legacy = input.workload ?? DEFAULT_WORKLOAD
  const scenario: ScenarioInput = input.scenario ?? { ...DEFAULT_SCENARIO,
    modelId: input.modelId, weightPrecision: input.quantId, computePrecision: input.quantId,
    unitCount: input.rackCount ?? 1, inputTokens: legacy.promptTokens,
    cachedTokens: Math.max(0, legacy.avgContextTokens - legacy.promptTokens), batch: legacy.batchPerReplica }
  const rackCount = scenario.unitCount
  const workload = { promptTokens: scenario.inputTokens,
    avgContextTokens: scenario.cachedTokens + scenario.inputTokens + Math.max(0, scenario.outputTokens - 1), batchPerReplica: scenario.batch }
  const usePack = pack === FACTORY_PACK
  const system = usePack ? systemById(input.systemId) : pack.systems.find((s) => s.id === input.systemId)
  const unit = capacityUnitWording(system?.architecture)
  const model: ModelSpec | undefined = usePack
    ? modelById(scenario.modelId)
    : pack.models.find((m) => m.id === scenario.modelId)
  const quant = QUANT_BY_ID[scenario.weightPrecision]

  const base = {
    systemId: input.systemId,
    systemName: system?.name ?? input.systemId,
    modelId: scenario.modelId,
    quantId: scenario.weightPrecision,
    rackCount,
    workload,
    scenario,
    allocation: null,
    decode: null,
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
      method: 'TP=1/2/4/8 按单 NVLink 域分配；显存按输出结束时 KV 峰值选卡。' +
        'prefill ≈ 2×激活参数×输入×batch / (TP×稠密算力×MFU)；decode = max(算力时间, 权重与 KV 读写时间)。' +
        'MoE 用均匀独立路由的 batch 专家并集，GQA 按 KV heads 分片，MLA latent 在 TP 上复制。',
      inputClaims: [] as CapacityInputClaim[],
    },
  } satisfies Omit<CapacityEstimate, 'kind' | 'reason' | 'reasonCode' | 'missing' | 'caveats'>

  if (!system) {
    return refusal(base, `内容包中没有系统 ${input.systemId}。`, ['系统定义'], 'unknown-system')
  }
  if (!model) {
    return refusal({ ...base }, `内容包中没有模型 ${input.modelId}。`, ['模型定义'], 'unknown-model')
  }
  if (!quant) {
    return refusal({ ...base }, `未知的量化口径 ${input.quantId}。`, ['量化口径'], 'unknown-quant')
  }

  const errors = scenarioErrors(scenario, model)
  if (errors.length) return refusal(base, errors.join(' '), [], 'invalid-scenario')

  // ── 拒绝门 1：按 capacityPolicy 分支的策略性拒绝（v1.3：不再直接依赖 status） ──
  // 这一档系统可能已经 `announced`（如 Rubin Ultra NVL576），但结构/规格主要来自
  // 第三方分析师（forecast 口径）；`missing` 恒为空——这不是「差一个官方数」，
  // 是这一代整体的口径强度不支持出产能数字，UI 不应该渲染「缺少的官方数据」列表。
  if (system.capacityPolicy === 'analyst-modeled') {
    return refusal(
      base,
      `${system.name} 已官宣，但结构细节主要来自第三方分析师（forecast 口径），本工具对它一律不出产能数字。`,
      [],
      'analyst-modeled-policy',
    )
  }
  if (system.capacityPolicy === 'paired-only') {
    return refusal(
      base,
      `${system.name} 只在与配对系统联合工作时才有产能语义（如与 GPU 机架组成 AFD 配对），本工具不提供它的独立产能数字。`,
      [],
      'paired-only-policy',
    )
  }
  // 防御性兜底：数据不一致时（capacityPolicy=standard 但 status 仍是 forecast）
  // 不应该被当成能正常出数的系统——正常情况下不会走到这里（三代系统的
  // capacityPolicy 与 status 组合都已在 pack.test.ts 里校验过）。
  if (system.status === 'forecast') {
    return refusal(
      base,
      `${system.name} 是预测（forecast）阶段的系统，其架构数据来自第三方分析师而非厂商规格表——本工具对它一律不出产能数字。`,
      ['NVIDIA 官方发布的规格表（GPU 显存/带宽/算力、机架功率）'],
      'forecast-status',
    )
  }

  const gpu = gpuComponentOf(system.id, pack)
  if (!gpu) {
    return refusal(base, `${system.name} 的装配树里没有 GPU 组件。`, ['GPU 组件定义'], 'missing-gpu-component')
  }

  // ── 消耗掉的官方 Claim（先收集，拒绝时也能显示「已有哪些」） ──
  const inputClaims: CapacityInputClaim[] = []
  const gpuCountClaim = system.keySpecs.gpuCount
  if (gpuCountClaim) inputClaims.push({ label: `${system.name} ${unit.perUnitGpuLabel}`, claim: gpuCountClaim })
  const powerClaim = system.keySpecs.rackPowerKW
  if (powerClaim) inputClaims.push({ label: `${system.name} ${unit.unitPowerLabel}`, claim: powerClaim })
  for (const key of MATH_BACKING_SPEC_KEYS) {
    const c = gpu.specs[key]
    if (c && c.value !== null) inputClaims.push({ label: `${gpu.name} · ${key}`, claim: c })
  }
  const withEvidence = { ...base, evidence: { ...base.evidence, inputClaims } }

  // ── 拒绝门 2：GPU 的官方数学参数缺失 ──
  const profile = resolveHardwareProfile(system.id, scenario.hardwareProfile, pack)
  const math = profile?.math ?? null
  if (profile) withEvidence.evidence.inputClaims = [
    ...profile.claims,
    { label: '每域 GPU 数', claim: gpuCountClaim! },
    ...(powerClaim ? [{label:'系统功率',claim:powerClaim}] : []),
  ]
  if (math === null) {
    return refusal(
      withEvidence,
      `${gpu.name} 缺少适用的已确认数学参数，因此不能算产能——本工具不会用分析师估算或记忆里的数字替代。`,
      [
        `${gpu.name} 单卡 HBM 容量（GB）`,
        `${gpu.name} 单卡显存带宽（TB/s）`,
        `${gpu.name} 单卡稠密算力（FP16 / FP8 / NVFP4 TFLOPS）`,
      ],
      'missing-math-specs',
    )
  }

  const gpuCount = typeof gpuCountClaim?.value === 'number' ? gpuCountClaim.value : null
  if (gpuCount === null) {
    return refusal(
      withEvidence,
      `${system.name} 缺少已确认的${unit.perUnitGpuLabel}量。`,
      [`${system.name} keySpecs.gpuCount`],
      'missing-gpu-count',
    )
  }

  const { tflops, basis } = tflopsForQuant(math, scenario.computePrecision)
  if (tflops === null) {
    return refusal(
      withEvidence,
      `${gpu.name} 的所选计算精度没有对应的已确认稠密算力，计算时间无法估算。INT4 不等于 NVFP4。`,
      [`${gpu.name} 稠密算力（FP8 / FP4 TFLOPS）`],
      'missing-dense-tflops',
    )
  }

  const totalGpus = gpuCount * rackCount
  const caveats: string[] = [CAPACITY_HEADLINE_CAVEAT, METHOD_CAVEAT]

  const weightsGB = model.totalParamsB * quant.bytesPerParam
  const peakContext = workload.avgContextTokens
  const choices = (scenario.tensorParallel === 'auto' ? [1,2,4,8] : [scenario.tensorParallel])
    .filter(tp => tp <= gpuCount)
  const perGpu = (tp: number) => {
    const kv = kvGBPerGpu(model, scenario, tp, peakContext)
    return kv === null ? null : weightsGB / tp * 1.1 + 2 + kv
  }
  if (kvGBPerGpu(model,scenario,1,peakContext) === null) {
    return refusal(withEvidence, 'KV 布局没有可靠公开参数，不能判定可部署显存或计算 decode。', ['KV 布局'], 'unsupported-kv')
  }
  const selectedTp = choices.find(tp => perGpu(tp)! <= math.memoryGB * 0.9)
  const gpusPerReplica = selectedTp ?? null
  const replicasPerDomain = selectedTp ? Math.floor(gpuCount / selectedTp) : 0
  const replicas = replicasPerDomain * rackCount
  const feasible = replicas > 0
  // The largest candidate explains why a scenario does not fit; it never contributes throughput.
  const tp = selectedTp ?? choices.at(-1) ?? 1
  const kvGB = kvGBPerGpu(model, scenario, tp, peakContext)!
  const mem: MemoryBreakdown = { weightsGB, kvGB: kvGB * tp,
    overheadGB: weightsGB * .1 + 2 * tp, totalGB: perGpu(tp)! * tp }
  const allocation = { domains: rackCount, gpusPerDomain: gpuCount, replicasPerDomain,
    idleGpus: (gpuCount - replicasPerDomain * tp) * rackCount,
    peakPerGpuGB: perGpu(tp)!, kvPerGpuGB: kvGB,
    kvDivisor: model.kvSpec.kind === 'mha-gqa' ? Math.min(tp, model.kvSpec.kvHeads) : 1 }
  caveats.push(`每个独立域 ${gpuCount} GPU；仅支持 TP=1/2/4/8。副本数 = floor(${gpuCount} / TP) × ${rackCount}，不跨域拼接。`)
  caveats.push(`按输出结束 ${peakContext} tokens 的 KV 峰值部署（最后输出尚未再次送入模型）；KV ${scenario.kvPrecision.toUpperCase()}。` +
    (model.kvSpec.kind === 'mla' ? 'MLA latent 在每个 TP GPU 上复制；没有加入 context parallelism。' : `KV 按 min(TP, KV heads)=${allocation.kvDivisor} 分片，其余 GPU 复制。`))
  caveats.push('显存另计权重 10% + 每 GPU 2 GB 运行开销，保留 10% HBM 余量；均为教学假设。权重量化需模型与内核支持。')
  if (!feasible) caveats.push('当前单域 TP≤8 无法容纳副本。增加独立服务器/机架无效；需降低 batch、上下文或权重精度。')
  const coverage = expertCoverage(model, scenario.batch)
  if (model.moe) caveats.push(`MoE 均匀独立路由假设：batch 预期覆盖 ${coverage.expectedExperts!.toFixed(1)} 个路由专家；每步读权重 ${coverage.minParamsB.toFixed(1)}–${coverage.maxParamsB.toFixed(1)}B，期望 ${coverage.expectedParamsB.toFixed(1)}B。共享专家计入固定权重；忽略专家异构与 all-to-all。`)
  if (scenario.weightPrecision === 'nvfp4') caveats.push('NVFP4 权重按 0.5625 B/参数（含每 16 个参数的 FP8 scale）；其他元数据归运行开销。')
  const ttft = feasible ? bandOf(
    estTTFTms(model.activeParamsB, scenario.inputTokens * scenario.batch, tflops, tp, MFU_BAND.high)!,
    estTTFTms(model.activeParamsB, scenario.inputTokens * scenario.batch, tflops, tp, MFU_BAND.mid)!,
    estTTFTms(model.activeParamsB, scenario.inputTokens * scenario.batch, tflops, tp, MFU_BAND.low)!,
  ) : null
  caveats.push('已有上下文假设 KV 已驻留；prefill 完成产生首个 token，输出 N 个 token 需要 N−1 次 decode；prefill 仅估计输入 tokens 的参数计算，未计注意力随上下文增长的额外 FLOPs、内核和采样成本。')
  const decodeAt = (context: number, mfu: number, mbu: number) => {
    const computeMs = estTTFTms(model.activeParamsB, scenario.batch, tflops, tp, mfu)!
    const readWriteKV = kvGBPerGpu(model,scenario,tp,context+1)!
    const memoryMs = (coverage.expectedParamsB * quant.bytesPerParam / tp + readWriteKV) / (math.bandwidthTBs * mbu)
    return { computeMs, memoryMs, ms: Math.max(computeMs,memoryMs) }
  }
  const finalReadContext = Math.max(scenario.cachedTokens + scenario.inputTokens, peakContext - 1)
  const stepMid = decodeAt(finalReadContext,MFU_BAND.mid,MBU_BAND.mid)
  const stepFast = decodeAt(finalReadContext,MFU_BAND.high,MBU_BAND.high).ms
  const stepSlow = decodeAt(finalReadContext,MFU_BAND.low,MBU_BAND.low).ms
  const tpot = feasible ? bandOf(stepFast, stepMid.ms, stepSlow) : null
  const decode = feasible ? { firstMemoryMs: decodeAt(scenario.cachedTokens+scenario.inputTokens,MFU_BAND.mid,MBU_BAND.mid).memoryMs, lastMemoryMs: stepMid.memoryMs, computeMs: stepMid.computeMs, memoryMs: stepMid.memoryMs,
    firstStepMs: decodeAt(scenario.cachedTokens+scenario.inputTokens,MFU_BAND.mid,MBU_BAND.mid).ms,
    lastStepMs: stepMid.ms, bottleneck: stepMid.computeMs >= stepMid.memoryMs ? 'compute' as const : 'memory' as const,
    expectedWeightParamsB: coverage.expectedParamsB, minWeightParamsB: coverage.minParamsB,
    maxWeightParamsB: coverage.maxParamsB, expectedExperts: coverage.expectedExperts } : null
  const tokensPerSec = feasible ? bandOf(
    tokensPerSecond(stepSlow,scenario.batch)! * replicas,
    tokensPerSecond(stepMid.ms,scenario.batch)! * replicas,
    tokensPerSecond(stepFast,scenario.batch)! * replicas,
  ) : null

  // ── tokens/W ──
  const rackPowerKW = typeof powerClaim?.value === 'number' ? powerClaim.value : null
  let tokensPerWatt: Band | null = null
  if (rackPowerKW === null) {
    caveats.push(
      `${system.name} 的${unit.unitPowerLabel}没有已确认的适用值（取决于配置或仍待确认），tokens/W 不出数。`,
    )
  } else if (tokensPerSec !== null) {
    const watts = rackPowerKW * 1000 * rackCount
    tokensPerWatt = bandOf(tokensPerSec.low / watts, tokensPerSec.mid / watts, tokensPerSec.high / watts)
    caveats.push(
      `tokens/W 用官方${unit.unitPowerLabel} ${rackPowerKW} kW（${powerClaim?.note?.includes('up to') ? '「最高」口径，不是典型工况' : '官方口径'}）` +
        `× ${unit.counterLabel}，未计入 CDU、机架外交换机与机房 PUE。`,
    )
  }

  caveats.push(NOT_MODELED_CAVEAT)

  return {
    ...withEvidence,
    kind: 'estimate',
    reason: null,
    reasonCode: null,
    missing: [],
    feasible,
    gpusPerReplica,
    replicas,
    totalGpus,
    memory: mem,
    allocation,
    decode,
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
