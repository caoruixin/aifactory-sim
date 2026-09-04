/**
 * 连接线「强调哪几条」的**唯一裁决者**（纯函数，零 three）。
 *
 * 在 v1.6 之前只有一个来源：数据流当前步骤的 `connectionIds`。切面章节引入了第二个来源
 * （`LensChapter.highlightConnectionIds`，用来点亮存储路径这类跨多跳的动线），两个来源
 * 会同时存在——lens 模式下用户照样能按播放键。于是这里把优先级写死一处，
 * 3D（`ConnectionLayer`）与降级（`Fallback2D` → `ConnectionListTable`）共用同一个结论，
 * 不可能再出现「3D 亮 A、降级表亮 B」。
 *
 * ## 优先级
 *
 *   1. **flow.playing 时数据流赢**——正在播放的东西是「此刻正在发生的事」，
 *      它必须盖过静态讲解（与 `highlightKindOf` 里 flow > scene 同一个语义排序）。
 *      逻辑层步骤（`connectionIds` 为空）不算数：那一步本来就没有线可点。
 *   2. **否则切面章节赢**——含 `reducedMotion`：切面的连接强调本身就是静态的，
 *      不依赖粒子动画，减少动态效果不该把它关掉。
 *   3. **否则维持现状**——仍然点亮当前步骤引用的连接（暂停时看某一步是既有行为），
 *      `reducedMotion` 下继续沿用「其余线退让」的静态反馈。
 *
 * `dim`（其余线退让到 `FLOW_EMPHASIS.idleOpacity`）与强调集合一起裁决：调用方只需再
 * 确认「这一屏确实画得出被强调的那条线」（退化边在当前深度根本没有路由，那时压暗整屏
 * 却一条都没点亮，是 v1.1 B3 已经踩过的坑）。
 */

import type { LensViewState } from './lens'
import { activeLensChapter } from './lens'

export type EmphasisSource = 'flow' | 'lens' | 'none'

export interface ConnectionEmphasisInput {
  mode: string
  lens: LensViewState | null | undefined
  /** 当前 `FlowStep` 引用的连接（逻辑层步骤为空数组）。 */
  stepConnectionIds: readonly string[]
  flowPlaying: boolean
  reducedMotion: boolean
  /**
   * 正在渲染的系统。给了它就与章节 pin 的代际比对，不一致时 lens 分支不生效
   * ——比较模式右视口画的是另一代，拿本章的连接 ID 去查只会一条都点不亮。
   */
  systemId?: string | null
}

export interface ConnectionEmphasis {
  source: EmphasisSource
  /** 该被强调的连接 ID（保序、去重）。 */
  connectionIds: string[]
  /** 其余（已开平面的）线是否退让。 */
  dim: boolean
}

function dedupe(ids: readonly string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

export function connectionEmphasis(input: ConnectionEmphasisInput): ConnectionEmphasis {
  const stepIds = dedupe(input.stepConnectionIds)

  // ① 播放中的数据流赢
  if (input.flowPlaying && stepIds.length > 0) {
    return { source: 'flow', connectionIds: stepIds, dim: true }
  }

  // ② 切面章节赢（含 reducedMotion）
  const chapter = activeLensChapter(input.mode, input.lens)
  if (chapter && (input.systemId == null || input.systemId === chapter.systemId)) {
    const lensIds = dedupe(chapter.highlightConnectionIds)
    if (lensIds.length > 0) return { source: 'lens', connectionIds: lensIds, dim: true }
  }

  // ③ 维持现状：仍点亮当前步骤的连接，reducedMotion 下保留静态退让
  return {
    source: 'none',
    connectionIds: stepIds,
    dim: input.reducedMotion && stepIds.length > 0,
  }
}

/** 便捷入口：只要集合（降级路径的连接列表整行 `data-active` 就靠它）。 */
export function emphasizedConnectionIds(input: ConnectionEmphasisInput): Set<string> {
  return new Set(connectionEmphasis(input).connectionIds)
}
