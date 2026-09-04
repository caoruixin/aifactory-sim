/**
 * 存储路径计算器（网络/存储切面 W-C）：模型加载耗时、KV 恢复 vs 重算——两个「单点理论下限」
 * 纯函数,零 three/react 导入，node 可测。
 *
 * ★ 与 `capacity.ts` 同一套纪律，但刻意**不复用**它的 caveat 常量（见 `STORAGE_CALC_HEADLINE_CAVEAT`）：
 *   这里算的是「体积 ÷ 带宽」的物理下限，不是 roofline 的算力/带宽墙模型，两件事分开标注更诚实。
 * ★ 口径显式化（`LinkRate.direction`）是 LEARNING.md v1.5 订正纪律的代码化：**双向合计**的数字
 *   （如 NVLink「1800 GB/s bi-directional」）不能直接当单向可用带宽用，必须先折算；
 *   `LinkRate.direction` 记录的是「这个数字本身是不是双向合计」，与 `data/types.ts` 里
 *   `Connection.direction`（这条物理链路是否支持双向通信）是**两个不同的问题**——
 *   例如 HGX 的 `con.hgx.cx8-leaf` 物理上是双工链路（`direction: 'bidirectional'`），
 *   但官方给的 800 Gb/s 数字是**单向端口速率口径**（不是双向合计），本文件按数字口径而非
 *   链路物理特性来标注 `LinkRate.direction`。
 * ★ null 传播纪律：任何一段带宽官方未公布 → 那一段（乃至依赖它的总量）一律 null，
 *   绝不当 0——UI 允许用户为「官方未公布」的段手输假设值，但假设值只作为函数参数传入，
 *   不落数据层，也不会让本文件替用户编数。
 */

import { FACTORY_PACK, componentById } from '../data'
import { claim as buildClaim } from '../data/claim'
import type {
  AssemblyNode,
  Connection,
  FactoryContentPack,
  HardwareComponent,
  ModelSpec,
} from '../data/types'
import type { Band, CapacityInputClaim } from './capacity'
import { MFU_BAND } from './capacity'
import { estTTFTms, kvBytesPerToken } from './roofline'

// ─────────────────────────── 带宽口径（LinkRate） ───────────────────────────

export type LinkRateUnit = 'GBps' | 'Gbps' | 'TBps'
export type LinkDirection = 'bidirectional' | 'unidirectional'

/** 一条链路的带宽声明。`label` 用于换算 note 里指名道姓（不写「这条链路」这种含糊话）。 */
export interface LinkRate {
  value: number | null
  unit: LinkRateUnit
  direction: LinkDirection
  label: string
}

const UNIT_LABEL: Record<LinkRateUnit, string> = {
  GBps: 'GB/s',
  Gbps: 'Gb/s',
  TBps: 'TB/s',
}

function toGBpsRaw(value: number, unit: LinkRateUnit): number {
  switch (unit) {
    case 'GBps':
      return value
    case 'TBps':
      return value * 1000
    case 'Gbps':
      return value / 8
  }
}

export interface UnidirGBps {
  gbps: number | null
  note: string
}

/**
 * 归一化为「单向可用」GB/s。
 * - 单位换算：TB/s ×1000、Gb/s ÷8，一律折算成 GB/s。
 * - 方向换算：`direction === 'bidirectional'` 视为「双向合计」，按 **÷2** 折算成单向可用估计值——
 *   这不是官方给出的单向实测数字，只是本项目的保守估算基准（v1.5 订正纪律：1.8 TB/s 双向
 *   **≠** 1800 GB/s 单向可用；把双向数字直接当单向用，正是「18×」那笔错账的算法根因）。
 * - `value === null`（官方未公布）一律返回 `gbps: null`，note 说明原因，绝不当 0。
 */
export function toUnidirGBps(rate: LinkRate): UnidirGBps {
  if (rate.value === null) {
    return { gbps: null, note: `${rate.label}：官方未公布带宽数字，无法折算，也不能当 0 处理。` }
  }
  const raw = toGBpsRaw(rate.value, rate.unit)
  const unitConvNote =
    rate.unit === 'GBps'
      ? ''
      : `已将 ${rate.value} ${UNIT_LABEL[rate.unit]} 换算为 ${raw.toLocaleString('zh-CN')} GB/s；`
  if (rate.direction === 'bidirectional') {
    const gbps = raw / 2
    return {
      gbps,
      note:
        `${unitConvNote}${rate.label} 官方口径是**双向合计** ${rate.value} ${UNIT_LABEL[rate.unit]}，` +
        `按「除以 2 视为单向可用」折算为 ${gbps.toLocaleString('zh-CN')} GB/s——这是本项目的保守估算基准，` +
        '不是官方给出的单向实测值（⚠️ 双向≠单向，混用口径会得出错误的倍数，见 LEARNING.md v1.5 订正）。',
    }
  }
  return {
    gbps: raw,
    note: `${unitConvNote}${rate.label} 官方口径已是单向可用带宽 ${rate.value} ${UNIT_LABEL[rate.unit]}，直接使用，未做方向折算。`,
  }
}

// ─────────────────────────── 模型加载：串行分段耗时 ───────────────────────────

export interface StorageSegmentInput {
  id: string
  label: string
  rate: LinkRate
}

export interface StorageSegmentResult {
  id: string
  label: string
  seconds: number | null
  gbpsUsed: number | null
  conversionNote: string
}

export interface ModelLoadBreakdown {
  segments: StorageSegmentResult[]
  bottleneckId: string | null
  totalSeconds: number | null
}

/**
 * 权重加载耗时：**串行保守口径**——各段依次搬运、互不重叠（不建模流水线/预取重叠），
 * 总时长 = 各段耗时之和。任一段带宽未知（null）→ 该段 `seconds` 为 null，且
 * `bottleneckId`/`totalSeconds` 一并为 null（某一段查不到官方带宽不代表它耗时为零）。
 * 瓶颈段 = 全部已知时耗时最长的一段。
 */
export function modelLoadBreakdown(weightGB: number, segments: StorageSegmentInput[]): ModelLoadBreakdown {
  const results: StorageSegmentResult[] = segments.map((seg) => {
    const { gbps, note } = toUnidirGBps(seg.rate)
    const seconds = gbps === null || gbps <= 0 ? null : weightGB / gbps
    return { id: seg.id, label: seg.label, seconds, gbpsUsed: gbps, conversionNote: note }
  })

  if (results.length === 0 || results.some((r) => r.seconds === null)) {
    return { segments: results, bottleneckId: null, totalSeconds: null }
  }

  let bottleneckId = results[0]!.id
  let maxSeconds = results[0]!.seconds!
  let totalSeconds = 0
  for (const r of results) {
    totalSeconds += r.seconds!
    if (r.seconds! > maxSeconds) {
      maxSeconds = r.seconds!
      bottleneckId = r.id
    }
  }
  return { segments: results, bottleneckId, totalSeconds }
}

// ─────────────────────────── KV 恢复 vs 重算 ───────────────────────────

export interface KvTierInput {
  id: string
  label: string
  rate: LinkRate
}

export interface KvTierResult {
  id: string
  label: string
  seconds: number | null
  gbpsUsed: number | null
  conversionNote: string
}

export interface KvRestoreVsRecomputeResult {
  /** 每 token 全层 KV 字节数（跨 roofline 交叉核对用）；kvSpec unsupported 时为 null。 */
  kvBytesPerTokenValue: number | null
  /** 该上下文长度对应的 KV cache 总量（GB）。 */
  kvTotalGB: number | null
  /** 重算侧：调 `roofline.estTTFTms`，透出 MFU 低/中/高三档（时延方向：low = 高利用率 = 更快）。 */
  recomputeTtftMsBand: Band | null
  /** 恢复侧：每个层级单点耗时 = KV 总量 ÷ 该层级单向可用带宽。 */
  restoreByTier: KvTierResult[]
  /** kvSpec unsupported 时非空，说明重算与恢复为什么全线 null。 */
  unsupportedReason: string | null
}

/**
 * KV「从层级恢复」vs「重算 prefill」哪边更快——单点理论下限对照。
 * `model.kvSpec.kind === 'unsupported'` → 重算与恢复**全线 null**（不做伪精确估算）。
 */
export function kvRestoreVsRecompute(
  model: ModelSpec,
  contextTokens: number,
  gpuTflops: number | null,
  gpuCount: number,
  tiers: KvTierInput[],
): KvRestoreVsRecomputeResult {
  const perToken = kvBytesPerToken(model.kvSpec)
  if (perToken === null) {
    const reason =
      model.kvSpec.kind === 'unsupported'
        ? `${model.name} 的 KV cache 口径没有可靠公开参数（${model.kvSpec.note}）`
        : `${model.name} 的 KV cache 口径未知`
    return {
      kvBytesPerTokenValue: null,
      kvTotalGB: null,
      recomputeTtftMsBand: null,
      restoreByTier: tiers.map((t) => ({
        id: t.id,
        label: t.label,
        seconds: null,
        gbpsUsed: null,
        conversionNote: `${reason}，无法估算。`,
      })),
      unsupportedReason: `${reason}，重算与恢复两侧均无法估算。`,
    }
  }

  const kvTotalGB = (perToken * contextTokens) / 1e9

  const recomputeTtftMsBand: Band | null =
    gpuTflops === null
      ? null
      : {
          low: estTTFTms(model.activeParamsB, contextTokens, gpuTflops, gpuCount, MFU_BAND.high)!,
          mid: estTTFTms(model.activeParamsB, contextTokens, gpuTflops, gpuCount, MFU_BAND.mid)!,
          high: estTTFTms(model.activeParamsB, contextTokens, gpuTflops, gpuCount, MFU_BAND.low)!,
        }

  const restoreByTier: KvTierResult[] = tiers.map((t) => {
    const { gbps, note } = toUnidirGBps(t.rate)
    const seconds = gbps === null || gbps <= 0 ? null : kvTotalGB / gbps
    return { id: t.id, label: t.label, seconds, gbpsUsed: gbps, conversionNote: note }
  })

  return { kvBytesPerTokenValue: perToken, kvTotalGB, recomputeTtftMsBand, restoreByTier, unsupportedReason: null }
}

// ─────────────────────────── 内容包数据适配（内部小工具） ───────────────────────────

type GpuComponent = Extract<HardwareComponent, { kind: 'gpu' }>

/** 系统装配树里第一个 kind==='gpu' 的组件（照抄 `capacity.ts` 的确定性取法，不导出复用它）。 */
export function gpuComponentOf(systemId: string, pack: FactoryContentPack): GpuComponent | null {
  const byId = new Map(pack.components.map((c) => [c.id, c]))
  for (const a of pack.assemblies) {
    if (a.systemId !== systemId) continue
    const c = byId.get(a.componentId)
    if (c && c.kind === 'gpu') return c
  }
  return null
}

/** 某系统内 roleKey 对应的第一个装配节点（跨代语义键纪律，同 `lib/lens.ts`）。 */
export function assemblyByRoleKey(
  systemId: string,
  roleKey: string,
  pack: FactoryContentPack,
): AssemblyNode | null {
  return pack.assemblies.find((a) => a.systemId === systemId && a.roleKey === roleKey) ?? null
}

/** 两个装配节点之间（不分 from/to 方向）的连接。 */
export function connectionBetween(
  systemId: string,
  aId: string,
  bId: string,
  pack: FactoryContentPack,
): Connection | null {
  return (
    pack.connections.find(
      (c) =>
        c.systemId === systemId &&
        ((c.fromAssemblyId === aId && c.toAssemblyId === bId) ||
          (c.fromAssemblyId === bId && c.toAssemblyId === aId)),
    ) ?? null
  )
}

// ─────────────────────────── 数据适配 1：模型加载分段（model-load 计算器） ───────────────────────────

export interface StorageLadder {
  segments: StorageSegmentInput[]
  inputClaims: CapacityInputClaim[]
}

/**
 * 存储路径分段数据适配（`model-load` 计算器用）：从内容包收集官方 Claim，拼出
 * 「L3 对象存储 → L2 共享存储 → 节点本地缓存盘 → GPU HBM」四段链路的 `LinkRate`。
 * 官方没有的段（对象存储聚合吞吐、本地缓存盘带宽）`value` 恒为 null——UI 允许用户
 * 在这两段上手输假设值，假设值只进 `modelLoadBreakdown` 的参数，不落数据层。
 */
export function storageLadderOf(systemId: string, pack: FactoryContentPack = FACTORY_PACK): StorageLadder {
  const inputClaims: CapacityInputClaim[] = []
  const segments: StorageSegmentInput[] = []

  // ── L3 对象存储 → L2 共享存储（预热路径；参考架构不涉及对象存储，恒 null） ──
  const objectStorage = componentById('cmp.shared.object-storage')
  const objectThroughputClaim = objectStorage?.specs.aggregateThroughputGBs
  if (objectThroughputClaim) {
    inputClaims.push({ label: 'L3 对象存储聚合吞吐', claim: objectThroughputClaim })
  }
  segments.push({
    id: 'object-to-shared',
    label: 'L3 对象存储 → L2 共享存储（预热）',
    rate: {
      value: typeof objectThroughputClaim?.value === 'number' ? objectThroughputClaim.value : null,
      unit: 'GBps',
      direction: 'unidirectional',
      label: 'L3 对象存储聚合吞吐',
    },
  })

  // ── L2 共享存储 → 计算节点（业务存储网；GB300 官方 40 GB/s，HGX 官方未给数） ──
  const switchNode = assemblyByRoleKey(systemId, 'converged-switch', pack)
  const storageNode = assemblyByRoleKey(systemId, 'external-storage', pack)
  const storageConn =
    switchNode && storageNode ? connectionBetween(systemId, switchNode.id, storageNode.id, pack) : null
  const storageBandwidthClaim = storageConn?.bandwidth ?? null
  if (storageBandwidthClaim) {
    inputClaims.push({ label: '业务存储网每节点带宽（L2 → 计算节点）', claim: storageBandwidthClaim })
  }
  segments.push({
    id: 'shared-to-node',
    label: 'L2 共享存储 → 计算节点（业务存储网）',
    rate: {
      value: typeof storageBandwidthClaim?.value === 'number' ? storageBandwidthClaim.value : null,
      unit: 'GBps',
      direction: 'unidirectional',
      label: '业务存储网每节点带宽',
    },
  })

  // ── 节点内本地缓存盘（E1.S / NVMe）：数量与容量有官方数字，带宽官方未公布 ──
  const cacheNode = assemblyByRoleKey(systemId, 'cache-storage', pack)
  const cacheComponent = cacheNode ? componentById(cacheNode.componentId) : null
  segments.push({
    id: 'local-cache',
    label: `节点内本地缓存盘${cacheComponent ? `（${cacheComponent.name}）` : ''}`,
    rate: { value: null, unit: 'GBps', direction: 'unidirectional', label: '本地缓存盘带宽' },
  })
  // 本地缓存盘没有官方带宽 Claim 可挂（specs 里只有数量/容量）——不是「没查到」，
  // 是这一段本来就没有官方数字，因此不进 inputClaims；UI 的 caveat 文案会点名这一段缺什么。

  // ── 节点本地缓存 → GPU HBM（GDS DMA 路径，走该系统 GPU 的官方显存带宽） ──
  const gpu = gpuComponentOf(systemId, pack)
  const hbmBandwidthTBs = gpu?.mathSpecs?.bandwidthTBs ?? null
  if (gpu?.mathSpecs) {
    inputClaims.push({
      label: `${gpu.name} 显存带宽`,
      claim: buildClaim<number>({
        value: gpu.mathSpecs.bandwidthTBs,
        unit: 'TB/s',
        sourceId: gpu.sourceIds[0] ?? 'src.nvidia-gb300-page',
        note: `取自 GPU 数学参数口径（mathSpecs.derivation）：${gpu.mathSpecs.derivation}`,
      }),
    })
  }
  segments.push({
    id: 'hbm-inject',
    label: `本地缓存 → GPU HBM（DMA${gpu ? `，${gpu.name}` : ''}）`,
    rate: { value: hbmBandwidthTBs, unit: 'TBps', direction: 'unidirectional', label: 'GPU 显存带宽' },
  })

  return { segments, inputClaims }
}

// ─────────────────────────── 数据适配 2：KV 恢复层级（kv-restore 计算器） ───────────────────────────

export interface KvRestoreTiers {
  tiers: KvTierInput[]
  inputClaims: CapacityInputClaim[]
}

/**
 * KV 恢复层级数据适配（`kv-restore` 计算器用）：L1 本地缓存盘、L2 共享存储的单向可用带宽。
 * 两段在 HGX 代际都是官方未公布——「KV 卸载到网络存储」是 RA 原文点名的**未来**负载，
 * 尚无 burst I/O 数字；UI 允许用户手输假设值来感受量级，assumed 值不落数据层。
 */
export function kvRestoreTiersOf(systemId: string, pack: FactoryContentPack = FACTORY_PACK): KvRestoreTiers {
  const inputClaims: CapacityInputClaim[] = []
  const tiers: KvTierInput[] = []

  const cacheNode = assemblyByRoleKey(systemId, 'cache-storage', pack)
  const cacheComponent = cacheNode ? componentById(cacheNode.componentId) : null
  tiers.push({
    id: 'l1-local-cache',
    label: `L1 本地缓存盘${cacheComponent ? `（${cacheComponent.name}）` : ''}`,
    rate: { value: null, unit: 'GBps', direction: 'unidirectional', label: 'L1 本地缓存盘带宽' },
  })

  const switchNode = assemblyByRoleKey(systemId, 'converged-switch', pack)
  const storageNode = assemblyByRoleKey(systemId, 'external-storage', pack)
  const storageConn =
    switchNode && storageNode ? connectionBetween(systemId, switchNode.id, storageNode.id, pack) : null
  const storageBandwidthClaim = storageConn?.bandwidth ?? null
  if (storageBandwidthClaim) {
    inputClaims.push({ label: 'L2 共享存储每节点带宽', claim: storageBandwidthClaim })
  }
  tiers.push({
    id: 'l2-shared-storage',
    label: 'L2 共享存储（业务存储网）',
    rate: {
      value: typeof storageBandwidthClaim?.value === 'number' ? storageBandwidthClaim.value : null,
      unit: 'GBps',
      direction: 'unidirectional',
      label: 'L2 共享存储每节点带宽',
    },
  })

  // kvOffloadNote 官方原句：不是数字，但是这一段「为什么两层都还没有硬指标」的关键佐证。
  const kvOffloadClaim = cacheComponent?.specs.kvCacheOffloadNote
  if (kvOffloadClaim) {
    inputClaims.push({ label: 'KV 卸载到网络存储（官方原句）', claim: kvOffloadClaim })
  }

  return { tiers, inputClaims }
}

// ─────────────────────────── caveat 常量 ───────────────────────────

/**
 * caveats 的固定首条。⚠️ 刻意不复用 `capacity.CAPACITY_HEADLINE_CAVEAT`——
 * roofline 产能粗估是「算力墙/带宽墙」模型，这里是更简单的「体积 ÷ 带宽」物理下限，
 * 两件事的方法论不同，共用一句话反而会把口径讲混。
 */
export const STORAGE_CALC_HEADLINE_CAVEAT =
  '单点理论下限（数据体积 ÷ 链路带宽），不是实测或可承诺的加载/恢复时长——只把「有多少数据」除以「链路带宽上限」。'

/** 未建模清单，UI 与 caveat 首条一起渲染。 */
export const STORAGE_CALC_NOT_MODELED: readonly string[] = [
  '协议开销',
  '并发争用',
  '条带化/多流并发',
  '排队',
]
