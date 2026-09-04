/**
 * KV 交接计算器（网络切面 W-C）：PD 分离场景下，一次 KV cache 交接在「NVLink 域 / 跨机计算网 /
 * 业务存储网」三档链路上各要多久——单点理论下限，纯函数，零 three/react 导入，node 可测。
 *
 * 复用 `storagePath.ts` 的 `LinkRate` / `toUnidirGBps`（同一套双向/单向口径纪律，不重复实现）。
 */

import { FACTORY_PACK } from '../data'
import type { Claim, FactoryContentPack } from '../data/types'
import { assemblyByRoleKey, connectionBetween, toUnidirGBps } from './storagePath'
import type { LinkRate } from './storagePath'

export interface KvTransferRung {
  id: string
  label: string
  rate: LinkRate
  /** 该档带宽背后的官方 Claim；官方没有对应数字时为 null（不编数）。 */
  claim: Claim | null
}

export interface KvTransferRungResult {
  id: string
  label: string
  seconds: number | null
  gbpsUsed: number | null
  conversionNote: string
}

/**
 * 一次 KV cache 交接在各档链路上的耗时：`seconds = kvGB ÷ 该档单向可用 GB/s`。
 * 每档相互独立（不是串行链路，是「同一份 KV 换一条路会花多久」的并排对照），
 * 某一档带宽官方未公布 → 该档 `seconds`/`gbpsUsed` 为 null，其余档不受影响。
 */
export function kvTransferLadder(kvGB: number, rungs: KvTransferRung[]): KvTransferRungResult[] {
  return rungs.map((rung) => {
    const { gbps, note } = toUnidirGBps(rung.rate)
    const seconds = gbps === null || gbps <= 0 ? null : kvGB / gbps
    return { id: rung.id, label: rung.label, seconds, gbpsUsed: gbps, conversionNote: note }
  })
}

export interface KvTransferRungsResult {
  rungs: KvTransferRung[]
}

/**
 * KV 交接三档链路的数据适配（`kv-transfer` 计算器用，章节 pin HGX B300）：
 * - **NVLink 域内**（板内/机架内一跳）：系统 `keySpecs.nvlinkAggregateBandwidthTBs`——
 *   官方原文明确写「双向合计」，`LinkRate.direction: 'bidirectional'`；
 * - **跨机计算网**（CX-8 SuperNIC）：`scaleout-nic` ↔ `scaleout-leaf` 连接的官方带宽——
 *   官方口径是**单向端口速率**（不是双向合计数字），即便 `Connection.direction` 字段
 *   标的是 `'bidirectional'`（物理链路双工），本函数仍按数字口径标注为 `'unidirectional'`；
 * - **业务存储网**（L2 共享存储）：`converged-switch` ↔ `external-storage` 连接的官方带宽，
 *   同样是单向可用口径，直接使用不做方向折算。
 * 内容包里查不到的档 `value: null`，不编数。
 */
export function kvTransferRungsOf(
  systemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): KvTransferRungsResult {
  const system = pack.systems.find((s) => s.id === systemId)

  // ── NVLink 域内：系统级聚合带宽 keySpec（双向合计口径） ──
  const nvlinkClaim = system?.keySpecs.nvlinkAggregateBandwidthTBs ?? null
  const nvlinkRung: KvTransferRung = {
    id: 'nvlink-domain',
    label: 'NVLink 域内直达（板内/机架内一跳）',
    rate: {
      value: typeof nvlinkClaim?.value === 'number' ? nvlinkClaim.value : null,
      unit: 'TBps',
      direction: 'bidirectional',
      label: 'NVLink 域聚合带宽',
    },
    claim: nvlinkClaim,
  }

  // ── 跨机计算网：scaleout-nic ↔ scaleout-leaf（单向端口速率口径） ──
  const nicNode = assemblyByRoleKey(systemId, 'scaleout-nic', pack)
  const leafNode = assemblyByRoleKey(systemId, 'scaleout-leaf', pack)
  const scaleoutConn = nicNode && leafNode ? connectionBetween(systemId, nicNode.id, leafNode.id, pack) : null
  const scaleoutClaim = scaleoutConn?.bandwidth ?? null
  const scaleoutRung: KvTransferRung = {
    id: 'cross-node-ethernet',
    label: '跨机计算网（CX-8 SuperNIC → Leaf）',
    rate: {
      value: typeof scaleoutClaim?.value === 'number' ? scaleoutClaim.value : null,
      unit: 'Gbps',
      direction: 'unidirectional',
      label: '跨机计算网每 GPU 带宽',
    },
    claim: scaleoutClaim,
  }

  // ── 业务存储网：converged-switch ↔ external-storage（单向可用口径） ──
  const switchNode = assemblyByRoleKey(systemId, 'converged-switch', pack)
  const storageNode = assemblyByRoleKey(systemId, 'external-storage', pack)
  const storageConn =
    switchNode && storageNode ? connectionBetween(systemId, switchNode.id, storageNode.id, pack) : null
  const storageClaim = storageConn?.bandwidth ?? null
  const storageRung: KvTransferRung = {
    id: 'storage-fabric',
    label: '业务存储网（L2 共享存储）',
    rate: {
      value: typeof storageClaim?.value === 'number' ? storageClaim.value : null,
      unit: 'GBps',
      direction: 'unidirectional',
      label: '业务存储网每节点带宽',
    },
    claim: storageClaim,
  }

  return { rungs: [nvlinkRung, scaleoutRung, storageRung] }
}

// ─────────────────────────── caveat 常量 ───────────────────────────

/**
 * caveats 的固定首条。⚠️ 与 `storagePath.STORAGE_CALC_HEADLINE_CAVEAT` 各自独立导出——
 * 两个计算器讲的是不同的物理量（KV 搬运 vs 权重加载），共用一句话会把场景讲混，
 * 也不复用/不修改 `capacity.CAPACITY_HEADLINE_CAVEAT`（那是 roofline 算力/带宽墙模型的措辞）。
 */
export const KV_TRANSFER_HEADLINE_CAVEAT =
  '单点理论下限（KV 体积 ÷ 链路带宽），不是实测或可承诺的 PD 交接时延——只把「要搬多少 KV」除以「链路带宽上限」。'

/** 未建模清单，UI 与 caveat 首条一起渲染。 */
export const KV_TRANSFER_NOT_MODELED: readonly string[] = [
  '协议开销',
  '并发争用',
  '条带化/多流并发',
  '排队',
]
