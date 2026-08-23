/**
 * `FlowEpisode.steps` + 路由结果 → `TimelineSegment[]`（纯函数，零 three 导入）。
 *
 * 只做一件事：把内容包里「教学节奏权重」（`durationHint`）切分成 [0,1] 归一化的时间区间，
 * 并把每步引用的 `connectionIds` 换成 `routing.ts` 算出来的实际折线（在当前渲染深度下
 * 查不到——比如两端收缩成了退化边——就留空数组，不是错误，调用方应该退化成只做
 * `highlightAssemblyIds` 静态高亮）。`FlowLayer` 拿着这份 `TimelineSegment[]` 沿路径采样
 * 粒子位置；`FlowBar` 拿它渲染步骤条。
 */

import { connectionById } from '../data'
import type { FlowEpisode, FlowPhase, LodLevel } from '../data/types'
import { visibleAncestorAt } from './routing'
import type { RoutedConnection } from './routing'

/** 七阶段中文名。`FlowBar` 步骤条与阶段徽章复用（与 `drill.ts` 的 `LEVEL_LABEL` 同样的放置方式）。 */
export const FLOW_PHASE_LABEL: Record<FlowPhase, string> = {
  ingress: '请求接入',
  prefill: 'Prefill',
  'kv-write': 'KV 写入',
  decode: 'Decode',
  'moe-dispatch': 'MoE 分发',
  'moe-combine': 'MoE 合并',
  egress: '结果返回',
}

export interface TimelineSegment {
  stepId: string
  phase: FlowPhase
  label: string
  description: string
  presalesNote: string | null
  logicalOnly: boolean
  /** 归一化时间区间 [0,1]（按 `durationHint` 权重切分整个 episode）。首段 t0=0，末段 t1=1。 */
  t0: number
  t1: number
  /** 原始权重——教学节奏用，禁止换算展示成真实时延。 */
  durationHint: number
  /** 该步骤引用、且在当前路由结果里能查到路径的连接（顺序与 `FlowStep.connectionIds` 一致）。 */
  paths: RoutedConnection[]
  /** 该步骤高亮的装配节点，原样透传自 `FlowStep.highlightAssemblyIds`。 */
  highlightAssemblyIds: string[]
}

/**
 * 构建时间轴。`routes` 通常是 `indexRoutesById(routeConnections(...))` 的结果——
 * 传一个当前深度下的路由索引即可，随下钻层级变化重新调用是廉价的（纯查表）。
 */
export function buildTimeline(
  episode: FlowEpisode,
  routes: ReadonlyMap<string, RoutedConnection>,
): TimelineSegment[] {
  const total = episode.steps.reduce((sum, s) => sum + s.durationHint, 0)
  const segments: TimelineSegment[] = []
  let acc = 0

  for (const step of episode.steps) {
    const t0 = total > 0 ? acc / total : 0
    acc += step.durationHint
    const t1 = total > 0 ? acc / total : 0
    const paths = step.connectionIds
      .map((id) => routes.get(id))
      .filter((r): r is RoutedConnection => r !== undefined)

    segments.push({
      stepId: step.id,
      phase: step.phase,
      label: step.label,
      description: step.description,
      presalesNote: step.presalesNote,
      logicalOnly: step.logicalOnly,
      t0,
      t1,
      durationHint: step.durationHint,
      paths,
      highlightAssemblyIds: step.highlightAssemblyIds,
    })
  }

  // 浮点误差兜底：最后一段的终点必须严格是 1，不然 FlowLayer 循环播放时会卡在 0.999999。
  const last = segments[segments.length - 1]
  if (last) last.t1 = 1

  return segments
}

/** 一个 segment 全部路径的端点集合（用于判断相邻段是否经共享端点连通）。 */
export function endpointsOf(segment: Pick<TimelineSegment, 'paths'>): Set<string> {
  const out = new Set<string>()
  for (const p of segment.paths) {
    out.add(p.fromAssemblyId)
    out.add(p.toAssemblyId)
  }
  return out
}

/** 两个都带路径的 segment 是否共享至少一个装配端点。 */
export function sharesEndpoint(
  a: Pick<TimelineSegment, 'paths'>,
  b: Pick<TimelineSegment, 'paths'>,
): boolean {
  const bs = endpointsOf(b)
  for (const id of endpointsOf(a)) if (bs.has(id)) return true
  return false
}

/** 给定全局归一化时间 t ∈ [0,1]，落在哪个 segment 的下标；空数组兜底返回 -1。 */
export function segmentIndexAtT(segments: readonly TimelineSegment[], t: number): number {
  if (segments.length === 0) return -1
  const clamped = Math.min(Math.max(t, 0), 1)
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    if (clamped <= seg.t1 || i === segments.length - 1) return i
  }
  return segments.length - 1
}

/** 整个 episode 的播放总时长（秒，按 speed=1 计），供 UI 显示总时长参考。 */
export function totalDurationSeconds(episode: FlowEpisode): number {
  return episode.steps.reduce((sum, s) => sum + s.durationHint, 0)
}

// ─────────────────────── 当前步骤 ↔ 参与硬件（v1.1 B1） ───────────────────────

export interface FlowStepFocus {
  /**
   * 该步骤引用的**精确**装配节点 ID：`connectionIds` 两端的原值 ∪ `highlightAssemblyIds`。
   * `FlowBar` 的「本步涉及」chips 用它——点进去要能看到 HBM 本身的详情，
   * 而不是它折叠后的那个托盘。
   */
  chipIds: string[]
  /**
   * 上面那组 ID 经 `visibleAncestorAt(depth)` 折叠后的集合：**当前深度下真的挂载在
   * 场景里**的那些节点，供 3D 高亮。例：kv-write 引用 HBM，在机架级折叠为「计算托盘」
   * 发光（语义正确，且任何深度都有反馈）。
   */
  sceneHighlightIds: string[]
}

const EMPTY_FOCUS: FlowStepFocus = { chipIds: [], sceneHighlightIds: [] }

/**
 * 当前步骤涉及哪些硬件（纯函数）。
 *
 * ★ 刻意**不把结果存进 store**：它是 `(episode, stepIdx, depth)` 的派生值，而深度变化
 *   （下钻、切代际）根本不经过 `setFlow`——存下来的 ID 会在下钻后失效（kv-write 引用的
 *   HBM 装配在 cluster/rack 深度压根没挂载）。组件里按 `[stepIdx, depth, generation]`
 *   useMemo 现算即可，成本是几次查表。
 */
export function flowStepFocus(
  episode: FlowEpisode | null | undefined,
  stepIdx: number,
  depth: LodLevel,
): FlowStepFocus {
  const step = episode?.steps[stepIdx]
  if (!step) return EMPTY_FOCUS

  const chipIds: string[] = []
  const pushChip = (id: string): void => {
    if (id && !chipIds.includes(id)) chipIds.push(id)
  }
  // 顺序：连接两端（按剧本里 connectionIds 的顺序）→ 显式高亮件。
  // 稳定顺序让 chips 不会在重渲染之间跳位。
  for (const cid of step.connectionIds) {
    const conn = connectionById(cid)
    if (!conn) continue
    pushChip(conn.fromAssemblyId)
    pushChip(conn.toAssemblyId)
  }
  for (const aid of step.highlightAssemblyIds) pushChip(aid)

  const sceneHighlightIds: string[] = []
  for (const id of chipIds) {
    const visible = visibleAncestorAt(id, depth)
    if (visible && !sceneHighlightIds.includes(visible)) sceneHighlightIds.push(visible)
  }

  return { chipIds, sceneHighlightIds }
}
