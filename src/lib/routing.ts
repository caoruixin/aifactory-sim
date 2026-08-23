/**
 * 连接可视化路由（纯元组数学，零 three 导入）。
 *
 * 给定内容包连接 + 摆位 + 当前渲染深度，算出：
 * 1. 每条连接两端「在当前 LOD 深度下实际可见」的端口世界坐标锚点——深度截断规则与
 *    `SceneRoot`/`AssemblyBranch` 的 `visibleKids` 过滤（`levelIndex(kid.lodLevel) <= maxDepth`）
 *    完全对应：端点若比当前深度更深，就沿祖先链上浮到最近的可见祖先，因此算出的锚点
 *    永远落在实际渲染出来的那个盒子上，不会悬空指向一个没画出来的芯片。
 * 2. 六平面各自的「端口方位」——同一个装配盒子上，不同平面从盒子的不同侧面/象限引出
 *    （nvlink→背板后下侧、scaleout/business/mgmt→后上部三路错开、power→母排侧、
 *    cooling→歧管侧），偏移量是节点自身 size 的比例，天然适配从机架到芯片的所有尺度，
 *    且与 `layout.ts` 里 busbar/manifold/nvlink-backplane 的实际摆位方向一致。
 * 3. 一条「升高 → 沿 X → 沿 Z → 落下」的正交折线；六个平面各占一层独立的总线高度
 *    （按 `PLANE_ORDER` 序号分层），因此即使两条不同平面的连接端点重合，折线也不会重叠。
 * 4. 累计弧长 LUT，供 `flowTimeline.ts` 与 `FlowLayer` 沿路径采样粒子位置。
 * 5. 机架扇出（v1.1 A2）：集群深度下折叠到「机架」节点的端点会为**每台机架**各出一条
 *    几何路径（`instancePaths`），但仍然只算**一条** `RoutedConnection`——见该字段注释。
 *
 * ★ 两端折叠到同一可见节点的连接（例如集群视图下 GPU↔NVSwitch 都收缩成同一个「机架」
 *   盒子）视为退化边，直接跳过——画一条长度为零的线没有意义。
 *
 * ★ 「哪些平面在哪一级该显示」（如集群级只画 scale-out）是 UI 策略，由 `ConnectionLayer`
 *   决定；本文件只负责「给定深度，这条连接的两端点世界坐标在哪、折线怎么走」。
 */

import { ancestorsOf, assemblyById, FACTORY_PACK } from '../data'
import type { NetworkPlane, LodLevel } from '../data/types'
import { levelIndex } from './drill'
import { worldPositionOf } from './layout'
import type { ResolvedLayout, Vec3 } from './layout'
import { PLANE_ORDER } from './palette'

/** 一条几何折线 + 它的弧长 LUT。`RoutedConnection` 的主路径与各机架实例路径共用这个形状。 */
export interface Path {
  /** 世界坐标折线顶点，长度 ≥ 2，相邻两点即一段。 */
  points: Vec3[]
  /** 累计弧长 LUT：与 `points` 等长，`lengths[0] = 0`，非递减。 */
  lengths: number[]
  /** 折线总长度 = `lengths` 最后一项。 */
  totalLength: number
}

export interface RoutedConnection extends Path {
  connectionId: string
  plane: NetworkPlane
  /** 折线两端实际依附的装配节点 ID（可能是 `Connection` 原始端点的可见祖先，而非其本身）。 */
  fromAssemblyId: string
  toAssemblyId: string
  /**
   * 机架扇出：端点折叠到 `count > 1` 的机架节点时，**每台机架一条几何路径**。
   *
   * ★ 刻意不拆成多条 `RoutedConnection`：`connectionId` 必须与内容包里的连接一一对应，
   *   否则 `indexRoutesById` 建的索引会被 `#i` 后缀击穿（`flowTimeline` 按连接 ID 查不到
   *   路径），`routing.test.ts` 里「NVL576 cluster 深度恰一条 nvlink 路由」这类按条数
   *   锁定的断言也会被打破。所以「一条连接 = 一条路由」不变，只是它带了一组几何路径。
   *
   * `instancePaths[0]` 恒等于本对象自身的 `points/lengths/totalLength`（主路径，
   * 数据流粒子沿它跑）；不扇出时长度为 1。
   */
  instancePaths: Path[]
}

// ─────────────────────────── 向量小工具 ───────────────────────────

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function sameVec(a: Vec3, b: Vec3, eps = 1e-9): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps
}

/** 两点间线性插值取点，`t` ∈ [0,1]。`flowTimeline.ts` 沿弧长 LUT 采样时复用。 */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// ─────────────────────────── 端口方位 ───────────────────────────

/**
 * 平面 → 端口在节点自身包围盒内的偏移比例（分量取值在 [-0.5, 0.5] 区间内，
 * 因此算出的锚点必然落在节点包围盒内部或边缘附近，不会跑出盒子）。
 *
 * - nvlink 贴机架背部下侧（呼应 `layout.ts` 的 `nvlink-backplane` 摆位）；
 * - scaleout / business / mgmt 都贴后上部，但左右错开一点，三条线不叠在一起；
 * - power 贴 +X 母排侧（呼应 `dc-busbar` 摆位在 +0.22），cooling 贴 -X 歧管侧
 *   （呼应 `liquid-manifold` 摆位在 -0.22）。
 */
const PORT_FRACTION: Record<NetworkPlane, Vec3> = {
  nvlink: [0, -0.16, -0.44],
  scaleout: [0, 0.34, -0.44],
  business: [0.14, 0.34, -0.44],
  mgmt: [-0.14, 0.34, -0.44],
  power: [0.3, 0, -0.32],
  cooling: [-0.3, 0, -0.32],
}

function portAnchor(center: Vec3, size: Vec3, plane: NetworkPlane): Vec3 {
  const f = PORT_FRACTION[plane]
  return vAdd(center, [size[0] * f[0], size[1] * f[1], size[2] * f[2]])
}

// ─────────────────────────── 深度截断 ───────────────────────────

/**
 * 从根到该节点的祖先链中，截到「在给定渲染深度下仍会被挂载」的最深一段——
 * 与 `AssemblyBranch` 的 `visibleKids = kids.filter(k => levelIndex(k.lodLevel) <= maxDepth)`
 * 是同一条规则，只是这里换成沿链条从根往下找「最后一个仍然可见」的节点。
 */
function visibleChain(assemblyId: string, depth: LodLevel): string[] {
  const chain = ancestorsOf(assemblyId)
  const maxDepth = levelIndex(depth)
  let cut = 0
  for (let i = 0; i < chain.length; i += 1) {
    if (levelIndex(chain[i]!.lodLevel) <= maxDepth) cut = i
  }
  return chain.slice(0, cut + 1).map((n) => n.id)
}

/** 给定深度下，该装配节点实际可见（会被挂载渲染）的那个自身或祖先的 ID。 */
export function visibleAncestorAt(assemblyId: string, depth: LodLevel): string {
  const chain = visibleChain(assemblyId, depth)
  return chain[chain.length - 1]!
}

// ─────────────────────────── 折线构造 ───────────────────────────

const LANE_FRACTION = 0.05
const MIN_LANE = 0.012

/** 去掉连续重复点——起止点在某轴对齐时，折线会自然退化掉那一段，避免零长度段污染 LUT。 */
function dedupe(points: Vec3[]): Vec3[] {
  const out: Vec3[] = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (!prev || !sameVec(prev, p)) out.push(p)
  }
  return out
}

/**
 * 「升高 → 沿 X → 沿 Z → 落到终点」的正交折线（每段只沿单一轴移动）。
 * 总线高度按平面在 `PLANE_ORDER` 中的序号分层（`busY` 随序号严格递增），
 * 是六平面即使端点重合也不会共线重叠的关键——`routing.test.ts` 直接验证这条。
 */
export function orthogonalPath(start: Vec3, end: Vec3, plane: NetworkPlane): Vec3[] {
  const dist = Math.max(vDist(start, end), 1e-6)
  const laneUnit = Math.max(dist * LANE_FRACTION, MIN_LANE)
  const laneIdx = Math.max(PLANE_ORDER.indexOf(plane), 0)
  const busY = Math.max(start[1], end[1]) + laneUnit * (laneIdx + 1)

  const raw: Vec3[] = [
    start,
    [start[0], busY, start[2]],
    [end[0], busY, start[2]],
    [end[0], busY, end[2]],
    end,
  ]
  return dedupe(raw)
}

/** 折线的累计弧长 LUT：`lengths[0] = 0`，与 `points` 等长，非递减。 */
export function arcLengthLUT(points: Vec3[]): { lengths: number[]; total: number } {
  const lengths = [0]
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1]! + vDist(points[i - 1]!, points[i]!))
  }
  return { lengths, total: lengths[lengths.length - 1] ?? 0 }
}

/** 沿弧长 LUT 按比例（0..1）采样折线上的一点。空折线兜底返回原点。 */
export function sampleAtFraction(points: Vec3[], lengths: number[], fraction: number): Vec3 {
  if (points.length === 0) return [0, 0, 0]
  if (points.length === 1) return points[0]!
  const total = lengths[lengths.length - 1] ?? 0
  const target = Math.min(Math.max(fraction, 0), 1) * total
  for (let i = 1; i < lengths.length; i += 1) {
    if (target <= lengths[i]!) {
      const segLen = lengths[i]! - lengths[i - 1]!
      const t = segLen <= 1e-12 ? 0 : (target - lengths[i - 1]!) / segLen
      return lerpVec3(points[i - 1]!, points[i]!, t)
    }
  }
  return points[points.length - 1]!
}

// ─────────────────────────── 主入口 ───────────────────────────

/**
 * 该端点在给定深度下要扇出几条几何路径。
 *
 * 只有**集群深度 + 折叠到 `roleKey === 'rack'` 的多实例节点**才扇出：8 台机架在
 * `layout.slots` 里是同一个装配节点的 8 个实例，只连第 0 台会让画面变成「只有排头
 * 那台机架接了线」。其余多实例节点（如 12 台管理节点）不扇出——12 条线糊成一片，
 * 反而读不出「控制面是一组节点」这件事（计划已决事项）。
 */
function fanOutCount(assemblyId: string, depth: LodLevel): number {
  if (depth !== 'cluster') return 1
  const node = assemblyById(assemblyId)
  if (!node || node.roleKey !== 'rack') return 1
  return Math.max(node.count, 1)
}

/**
 * 给定系统 + 摆位 + 渲染深度，算出全部「两端可见且不退化」连接的折线路由。
 * 不做平面开关/展示策略过滤——那是 `ConnectionLayer` 的职责，这里只管几何。
 *
 * @param exploded 是否使用 board 级 explode 后的坐标（`layout.ts` 的 `explodedSlots`）。
 *   board 级硬件确实是按 explode 偏移渲染的，因此下钻到拆解视图时必须传 `true`，
 *   否则线会落在收拢坐标上、与拆开的器件明显脱节（v1.1 B4 修复）。
 */
export function routeConnections(
  systemId: string,
  layout: ResolvedLayout,
  depth: LodLevel,
  exploded = false,
): RoutedConnection[] {
  const out: RoutedConnection[] = []
  for (const c of FACTORY_PACK.connections) {
    if (c.systemId !== systemId) continue

    const fromChain = visibleChain(c.fromAssemblyId, depth)
    const toChain = visibleChain(c.toAssemblyId, depth)
    const fromId = fromChain[fromChain.length - 1]!
    const toId = toChain[toChain.length - 1]!
    if (fromId === toId) continue // 退化边：两端收缩到同一个可见盒子

    const fromItem = layout.get(fromId)
    const toItem = layout.get(toId)
    if (!fromItem || !toItem) continue

    const fromFan = fanOutCount(fromId, depth)
    const toFan = fanOutCount(toId, depth)
    const instances = Math.max(fromFan, toFan)

    const instancePaths: Path[] = []
    for (let i = 0; i < instances; i += 1) {
      const fromCenter = worldPositionOf(layout, fromChain, fromFan > 1 ? i : 0, exploded)
      const toCenter = worldPositionOf(layout, toChain, toFan > 1 ? i : 0, exploded)
      const start = portAnchor(fromCenter, fromItem.size, c.plane)
      const end = portAnchor(toCenter, toItem.size, c.plane)
      const points = orthogonalPath(start, end, c.plane)
      const { lengths, total } = arcLengthLUT(points)
      instancePaths.push({ points, lengths, totalLength: total })
    }
    // instances ≥ 1 恒成立（fanOutCount 至少返回 1），主路径即第 0 条
    const main = instancePaths[0]!

    out.push({
      connectionId: c.id,
      plane: c.plane,
      fromAssemblyId: fromId,
      toAssemblyId: toId,
      points: main.points,
      lengths: main.lengths,
      totalLength: main.totalLength,
      instancePaths,
    })
  }
  return out
}

/** 按 `connectionId` 建索引，`flowTimeline.ts` 与 `FlowLayer` 按步骤引用的连接 ID 查路径用。 */
export function indexRoutesById(routes: RoutedConnection[]): ReadonlyMap<string, RoutedConnection> {
  return new Map(routes.map((r) => [r.connectionId, r]))
}
