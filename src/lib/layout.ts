/**
 * 装配树 → 3D 摆位（纯元组数学，零 three 导入）。
 *
 * 坐标约定
 * - 单位：**1 unit = 1 米**。
 * - 右手系，+Y 朝上（three.js 默认）。机架正面朝 +Z。
 * - 每个 `LayoutItem.slots[i]` 是「该实例中心」在**父装配节点局部坐标系**中的位置；
 *   父节点的局部原点 = 父节点几何体的中心。渲染侧因此可以直接嵌套
 *   `<group position={slot}>`，不需要在场景里再做一次坐标换算。
 * - 一个 `AssemblyNode` 的 `count` 个实例共享同一个 `size`，位置由 `slots` 逐个给出。
 *
 * rack-U 约定（与 `types.ts` 一致）：`rackU.height` 覆盖该节点**全部 count 个实例**的
 * 连续跨度，因此单实例槽高 = height / count。18 个计算托盘（start 11, height 18）
 * 于是各占 1U，9 个交换托盘（start 29, height 9）同理。
 *
 * ⚠️ 所有摆位都是**示意**：NVIDIA 未公布 GB300 NVL72 的逐 U 布局与板级坐标，
 *    这里只保证「同层不重叠、数量正确、跨代可比」，不代表真实机械图。
 */

import { FACTORY_PACK } from '../data'
import type { AssemblyNode, FactoryContentPack } from '../data/types'

export type Vec3 = [number, number, number]

// ─────────────────────────── 物理常量 ───────────────────────────

/** 1 机架单位 = 44.45 mm（EIA-310 标准）。 */
export const U_METERS = 0.04445
/** 机架外形（Oberon/MGX 量级的示意尺寸）。 */
export const RACK_WIDTH = 0.6
export const RACK_DEPTH = 1.2
/** 机架中心间距：0.6 m 机架 + 0.3 m 维护间隙。 */
export const RACK_PITCH = 0.9
/** rackUnitsForLayout 缺失时的兜底高度。 */
export const DEFAULT_RACK_UNITS = 48

/** 托盘等 U 位设备相对机架内净空的收缩比（留出导轨与缝隙，视觉上能看出分层）。 */
const SLOT_WIDTH_RATIO = 0.9
const SLOT_DEPTH_RATIO = 0.86
const SLOT_HEIGHT_RATIO = 0.8

// ─────────────────────────── 输出类型 ───────────────────────────

export interface LayoutItem {
  assemblyId: string
  /** 单个实例的外形尺寸（米）。 */
  size: Vec3
  /** 每个实例中心在父节点局部坐标系中的位置，长度恒等于 `AssemblyNode.count`。 */
  slots: Vec3[]
  /** explode（board 级拆解）视图下的实例位置，长度同上。未参与拆解时与 `slots` 相同。 */
  explodedSlots: Vec3[]
  /** 全部实例的几何中心。 */
  pos: Vec3
  explodedPos: Vec3
  /** 全部实例合起来的包围盒尺寸（父局部坐标系），相机 fit 用。 */
  extent: Vec3
}

export type ResolvedLayout = ReadonlyMap<string, LayoutItem>

// ─────────────────────────── 尺寸与摆位规则表 ───────────────────────────
//
// 规则按 roleKey 索引（roleKey 是跨代稳定语义键，换代不用改 3D 代码）。
// 表里没有的 roleKey 会走 `genericPlacement` 兜底，因此新增装配节点不会崩，
// 只是摆位变成「父节点内均分一排」。

interface Placement {
  size: Vec3
  /** 计算 count 个实例的局部位置。 */
  slots: (count: number, ctx: PlacementCtx) => Vec3[]
  /** explode 时的抬升高度（米）与 XZ 展开系数。 */
  explode?: { lift: number; spread: number }
}

interface PlacementCtx {
  /** 父节点单实例尺寸。 */
  parentSize: Vec3
  /** 机架示意总高（米）；仅 rack 内节点用得上。 */
  rackHeight: number
  node: AssemblyNode
}

function row(count: number, pitch: number, y: number, z: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < count; i += 1) out.push([(i - (count - 1) / 2) * pitch, y, z])
  return out
}

function column(count: number, pitch: number, x: number, z: number, y0: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < count; i += 1) out.push([x, y0 + i * pitch, z])
  return out
}

/** 机架内按 rack-U 摆位：单实例槽高 = height / count。 */
function rackUSlots(count: number, ctx: PlacementCtx): Vec3[] {
  const span = ctx.node.rackU
  if (!span) return row(count, ctx.parentSize[0] / (count + 1), 0, 0)
  const slotU = span.height / count
  const out: Vec3[] = []
  for (let i = 0; i < count; i += 1) {
    const uCenter = span.start - 1 + (i + 0.5) * slotU
    out.push([0, uCenter * U_METERS - ctx.rackHeight / 2, 0.015])
  }
  return out
}

function rackUSize(ctx: PlacementCtx): Vec3 {
  const span = ctx.node.rackU
  const slotU = span ? span.height / ctx.node.count : 1
  return [
    RACK_WIDTH * SLOT_WIDTH_RATIO,
    slotU * U_METERS * SLOT_HEIGHT_RATIO,
    RACK_DEPTH * SLOT_DEPTH_RATIO,
  ]
}

/** 计算/交换托盘的外形（板级摆位全部相对它的中心）。 */
const TRAY_SIZE: Vec3 = [
  RACK_WIDTH * SLOT_WIDTH_RATIO,
  U_METERS * SLOT_HEIGHT_RATIO,
  RACK_DEPTH * SLOT_DEPTH_RATIO,
]

const PLACEMENTS: Record<string, Placement> = {
  // ── cluster 层：机房内的「电、水、网、算」四件事各占一块地 ──
  facility: { size: [28, 4.5, 18], slots: () => [[0, 0, 0]] },
  'rack-row': {
    size: [8 * RACK_PITCH, 2.2, RACK_DEPTH],
    slots: () => [[0, 0, 0]],
  },
  rack: {
    size: [RACK_WIDTH, 2.2, RACK_DEPTH],
    slots: (count, ctx) =>
      row(count, RACK_PITCH, ctx.rackHeight / 2, 0),
  },
  cdu: { size: [0.9, 2.0, 1.2], slots: () => [[-5.4, 1.0, 0]] },
  'facility-water-loop': { size: [0.34, 0.34, 13], slots: () => [[-7.0, 0.35, 0]] },
  'external-storage': { size: [1.3, 2.0, 1.1], slots: () => [[5.4, 1.0, 0]] },
  // 交换层与管理节点堆成两个「网络机柜」立在机架列后方：
  // 逐层贴着叠放（而不是悬空分散），才读得出「这是一柜设备」而非漂浮的方块。
  'scaleout-spine': { size: [0.62, 0.32, 0.9], slots: () => [[0, 1.09, -4.4]] },
  'scaleout-leaf': { size: [0.62, 0.32, 0.9], slots: () => [[0, 0.72, -4.4]] },
  'converged-switch': { size: [0.62, 0.32, 0.9], slots: () => [[0, 0.35, -4.4]] },
  'oob-mgmt-switch': { size: [0.62, 0.2, 0.9], slots: () => [[2.4, 0.1, -4.4]] },
  'control-plane-node': {
    size: [0.52, 0.09, 0.9],
    slots: (count) => column(count, 0.11, -2.6, -4.4, 0.05),
  },

  // ── rack 层：占 U 位的走 rackU，纵向贯穿件单独摆 ──
  'compute-tray': { size: [0, 0, 0], slots: rackUSlots },
  'nvswitch-tray': { size: [0, 0, 0], slots: rackUSlots },
  'power-shelf': { size: [0, 0, 0], slots: rackUSlots },
  'inrack-mgmt-switch': { size: [0, 0, 0], slots: rackUSlots },
  'dc-busbar': {
    size: [0.09, 1.9, 0.09],
    slots: () => [[0.22, 0, -RACK_DEPTH / 2 + 0.07]],
  },
  'liquid-manifold': {
    size: [0.09, 1.9, 0.09],
    slots: () => [[-0.22, 0, -RACK_DEPTH / 2 + 0.07]],
  },
  'nvlink-backplane': {
    size: [RACK_WIDTH * 0.86, 0.9, 0.035],
    slots: () => [[0, 0.1, -RACK_DEPTH / 2 + 0.17]],
  },

  // ── 计算托盘内部（board 级） ──
  accelerator: {
    size: [0.086, 0.012, 0.086],
    slots: (count) => row(count, 0.13, 0.006, 0.16),
    explode: { lift: 0.0, spread: 1.18 },
  },
  'host-cpu': {
    size: [0.075, 0.01, 0.075],
    slots: (count) => row(count, 0.22, 0.005, -0.1),
    explode: { lift: 0.0, spread: 1.18 },
  },
  'gpu-hbm': {
    // GPU 封装两侧各 4 颗堆栈（数量为视觉示意，见 asm.gb300.hbm 的 note）
    size: [0.013, 0.014, 0.018],
    slots: (count) => {
      const half = Math.ceil(count / 2)
      const out: Vec3[] = []
      for (let i = 0; i < count; i += 1) {
        const side = i < half ? -1 : 1
        const k = i < half ? i : i - half
        const n = i < half ? half : count - half
        out.push([side * 0.052, 0.001, (k - (n - 1) / 2) * 0.022])
      }
      return out
    },
    explode: { lift: 0.028, spread: 1.9 },
  },
  'nic-mezzanine': {
    size: [0.13, 0.005, 0.17],
    slots: (count) => row(count, 0.27, 0.003, -0.3),
    explode: { lift: 0.08, spread: 1.15 },
  },
  'scaleout-nic': {
    size: [0.055, 0.007, 0.055],
    slots: (count) => {
      const out: Vec3[] = []
      for (let i = 0; i < count; i += 1) out.push([0, 0.006, (i - (count - 1) / 2) * 0.085])
      return out
    },
    explode: { lift: 0.022, spread: 1.5 },
  },
  'north-south-dpu': {
    size: [0.07, 0.007, 0.07],
    slots: (count) => row(count, 0.1, 0.004, -0.3),
    explode: { lift: 0.08, spread: 1.15 },
  },
  'os-storage': {
    size: [0.024, 0.006, 0.085],
    slots: (count) => row(count, 0.04, 0.004, 0.42).map((p) => [p[0] - 0.2, p[1], p[2]] as Vec3),
    explode: { lift: 0.055, spread: 1.15 },
  },
  'cache-storage': {
    size: [0.038, 0.008, 0.11],
    slots: (count) => row(count, 0.05, 0.005, 0.42).map((p) => [p[0] + 0.08, p[1], p[2]] as Vec3),
    explode: { lift: 0.055, spread: 1.15 },
  },
  'cold-plate': {
    size: [0.5, 0.006, 0.62],
    slots: () => [[0, 0.0135, 0.02]],
    explode: { lift: 0.17, spread: 1 },
  },

  // ── 跨机架光互连（Rubin Ultra NVL576 新增的一层） ──
  // 画在机架列后上方：它在物理上就是「机架之间」的东西，放地面上会跟机架抢位置。
  'interrack-scaleup-fabric': {
    size: [3.2, 0.28, 0.7],
    slots: () => [[0, 2.65, -2.6]],
  },

  // ── 交换托盘内部 ──
  'nvswitch-asic': {
    size: [0.08, 0.012, 0.08],
    slots: (count) => row(count, 0.26, 0.006, 0),
    explode: { lift: 0.0, spread: 1.2 },
  },
  'nvswitch-cold-plate': {
    size: [0.46, 0.006, 0.34],
    slots: () => [[0, 0.0135, 0]],
    explode: { lift: 0.17, spread: 1 },
  },
  // NPO 光模块：交换托架上每颗交换芯片旁 4 个，按 4×4 网格摆在托架前半部。
  'scaleup-optics': {
    size: [0.028, 0.009, 0.03],
    slots: (count) => {
      const perRow = 4
      const out: Vec3[] = []
      for (let i = 0; i < count; i += 1) {
        const col = i % perRow
        const rowIdx = Math.floor(i / perRow)
        const rows = Math.max(1, Math.ceil(count / perRow))
        out.push([(col - (perRow - 1) / 2) * 0.09, 0.006, (rowIdx - (rows - 1) / 2) * 0.075 + 0.22])
      }
      return out
    },
    explode: { lift: 0.03, spread: 1.25 },
  },
}

/** 规则表未覆盖的 roleKey：父节点内均分一排，尺寸取父节点的一个小比例。 */
function genericPlacement(ctx: PlacementCtx): Placement {
  const [pw, ph, pd] = ctx.parentSize
  const size: Vec3 = [
    Math.max(pw * 0.12, 0.02),
    Math.max(ph * 0.12, 0.02),
    Math.max(pd * 0.12, 0.02),
  ]
  return {
    size,
    slots: (count) => row(count, pw / (count + 1), 0, 0),
  }
}

// ─────────────────────────── 解析 ───────────────────────────

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function centerOf(slots: Vec3[]): Vec3 {
  if (slots.length === 0) return [0, 0, 0]
  const s = slots.reduce<Vec3>((acc, p) => vAdd(acc, p), [0, 0, 0])
  return [s[0] / slots.length, s[1] / slots.length, s[2] / slots.length]
}

function extentOf(slots: Vec3[], size: Vec3): Vec3 {
  if (slots.length === 0) return size
  const out: Vec3 = [0, 0, 0]
  for (let axis = 0; axis < 3; axis += 1) {
    let lo = Infinity
    let hi = -Infinity
    for (const p of slots) {
      lo = Math.min(lo, p[axis] - size[axis] / 2)
      hi = Math.max(hi, p[axis] + size[axis] / 2)
    }
    out[axis] = hi - lo
  }
  return out
}

/**
 * 解析一个系统的完整摆位。纯函数：同 pack + 同 systemId ⇒ 逐位相同的输出。
 */
export function resolveLayout(
  systemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): ResolvedLayout {
  const out = new Map<string, LayoutItem>()
  const root = pack.assemblies.find((a) => a.systemId === systemId && a.parentId === null)
  if (!root) return out

  const system = pack.systems.find((s) => s.id === systemId)
  const rackUnits = system?.rackUnitsForLayout ?? DEFAULT_RACK_UNITS
  const rackHeight = rackUnits * U_METERS

  const byParent = new Map<string, AssemblyNode[]>()
  for (const a of pack.assemblies) {
    if (a.parentId === null) continue
    const bucket = byParent.get(a.parentId)
    if (bucket) bucket.push(a)
    else byParent.set(a.parentId, [a])
  }
  const kidsOf = (id: string): AssemblyNode[] => byParent.get(id) ?? []
  const rackCount = pack.assemblies.find((a) => a.systemId === systemId && a.roleKey === 'rack')?.count ?? 1

  const walk = (node: AssemblyNode, parentSize: Vec3): void => {
    const ctx: PlacementCtx = { parentSize, rackHeight, node }
    const rule = PLACEMENTS[node.roleKey] ?? genericPlacement(ctx)

    // rack-U 设备的尺寸由槽高推导；机架与机架列的高度跟随 rackUnitsForLayout。
    let size = rule.size
    if (node.rackU) size = rackUSize(ctx)
    else if (node.roleKey === 'rack') size = [RACK_WIDTH, rackHeight, RACK_DEPTH]
    else if (node.roleKey === 'rack-row') size = [rackCount * RACK_PITCH, rackHeight, RACK_DEPTH]
    else if (node.roleKey === 'dc-busbar' || node.roleKey === 'liquid-manifold')
      size = [rule.size[0], rackHeight * 0.86, rule.size[2]]
    else if (node.roleKey === 'nvlink-backplane')
      size = [rule.size[0], rackHeight * 0.42, rule.size[2]]
    else if (size[0] === 0 && size[1] === 0 && size[2] === 0) size = TRAY_SIZE

    const slots = rule.slots(node.count, ctx)
    const ex = rule.explode
    const explodedSlots: Vec3[] = ex
      ? slots.map((p) => [p[0] * ex.spread, p[1] + ex.lift, p[2] * ex.spread] as Vec3)
      : slots.map((p) => [...p] as Vec3)

    out.set(node.id, {
      assemblyId: node.id,
      size,
      slots,
      explodedSlots,
      pos: centerOf(slots),
      explodedPos: centerOf(explodedSlots),
      extent: extentOf(slots, size),
    })

    for (const kid of kidsOf(node.id)) walk(kid, size)
  }

  // 机房本体：根节点的「父」是世界坐标系。
  const rootRule = PLACEMENTS[root.roleKey] ?? genericPlacement({ parentSize: [30, 6, 20], rackHeight, node: root })
  walk(root, rootRule.size)
  return out
}

// ─────────────────────────── 记忆化 + 世界坐标 ───────────────────────────

const layoutCache = new Map<string, ResolvedLayout>()

/** 记忆化版本：内容包是静态的，同一系统只解析一次。 */
export function layoutOf(systemId: string): ResolvedLayout {
  const hit = layoutCache.get(systemId)
  if (hit) return hit
  const resolved = resolveLayout(systemId)
  layoutCache.set(systemId, resolved)
  return resolved
}

/**
 * 把某节点的实例位置累加成世界坐标。
 *
 * 祖先链上 count > 1 的节点一律取第 0 个实例——B2 的下钻焦点不区分实例序号
 * （面包屑与相机只认 assemblyId），这个约定同时保证了相机预设的确定性。
 */
export function worldPositionOf(
  layout: ResolvedLayout,
  ancestorChain: readonly string[],
  instanceIndex = 0,
  exploded = false,
): Vec3 {
  let acc: Vec3 = [0, 0, 0]
  ancestorChain.forEach((id, depth) => {
    const item = layout.get(id)
    if (!item) return
    const idx = depth === ancestorChain.length - 1 ? instanceIndex : 0
    const source = exploded ? item.explodedSlots : item.slots
    const slot = source[Math.min(idx, source.length - 1)] ?? [0, 0, 0]
    acc = vAdd(acc, slot)
  })
  return acc
}
