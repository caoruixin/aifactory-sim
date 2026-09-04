/**
 * 导览场景 `highlightAssemblyIds` → 当前渲染深度下真的能点亮的节点集合（纯函数，零 three）。
 *
 * 为什么需要它：`ScenePreset.highlightAssemblyIds` 从 B2 起就写在内容包里，但**一直没有
 * 任何运行时消费者**——「这一站要看的是这三件」只存在于数据里，屏幕上没有任何表现。
 * v1.3 W2 把它接起来，走的是与 `flowStepFocus` 完全相同的模式：
 *
 *   原始 ID（内容作者按语义写，可能是 HBM 这种板级件）
 *     → `visibleAncestorAt(depth)` 折叠
 *     → 当前深度下确实挂载在场景里的祖先（机架级就折叠成「计算托盘」）
 *
 * ★ 与数据流高亮**分属两个通道**：`SceneRoot` 分别下传 `flowActive` / `sceneActive`，
 *   优先级由 `palette.highlightKindOf` 统一裁决（selected > hovered > flow > scene），
 *   而**脉冲只认 flow**——导览是静态讲解，不该让整屏呼吸。
 *
 * ★ 与 `flowStepFocus` 一样**刻意不进 store**：它是 `(scene, depth)` 的派生值，
 *   而深度变化（下钻）根本不经过 `applyScene`，存下来的 ID 一下钻就失效。
 *
 * ★ v1.6 起还有第二个来源：切面章节的 `highlightAssemblyIds`（`lensHighlightFocus`）。
 *   它走**同一套折叠**并复用同一个 scene 通道——切面与导览在同一时刻只可能有一个生效
 *   （`mode` 三选一），所以不需要第五个高亮通道，`highlightKindOf` 一行都不用改。
 */

import { sceneById, scenesOfSystem } from '../data'
import type { LodLevel, ScenePreset } from '../data/types'
import type { LensViewState } from './lens'
import { activeLensChapter } from './lens'
import { visibleAncestorAt } from './routing'

export interface SceneHighlightFocus {
  /**
   * 场景写下的**精确**装配节点 ID（去重、保序）。
   * 需要「原样的那一件」时用它（例如将来做 chips / 列表联动）。
   */
  chipIds: string[]
  /**
   * 上面那组 ID 经 `visibleAncestorAt(depth)` 折叠后的集合：**当前深度下真的挂载在
   * 场景里**的那些节点，供 3D 与结构图高亮。
   */
  sceneHighlightIds: string[]
}

const EMPTY_FOCUS: SceneHighlightFocus = { chipIds: [], sceneHighlightIds: [] }

/**
 * 当前导览站对应的场景。
 *
 * 生效条件写死在这里（而不是散在组件里）：**只有 `mode === 'tour'` 且当前站号落在
 * 该系统的场景列表内**才算「正在导览」。`tourStopIdx` 是**系统内**序号
 * （见 `store.applyScene` 的注释），因此必须用 `scenesOfSystem(generation)` 取，
 * 不能拿它去索引全包的 `FACTORY_PACK.scenes`。
 */
export function activeTourScene(
  mode: string,
  generation: string,
  tourStopIdx: number,
): ScenePreset | null {
  if (mode !== 'tour') return null
  if (tourStopIdx < 0) return null
  return scenesOfSystem(generation)[tourStopIdx] ?? null
}

/** 同上，但直接给场景 id（`?tour=` 深链的单测用得上）。 */
export function sceneHighlightFocusById(sceneId: string, depth: LodLevel): SceneHighlightFocus {
  return sceneHighlightFocus(sceneById(sceneId) ?? null, depth)
}

/**
 * 一组「内容作者写下的」装配 ID → 该深度下真的挂载的集合。
 * 导览场景与切面章节（v1.6）共用它——两边写的都是同一种语义 ID，
 * 折叠规则没有任何理由分叉。
 */
export function highlightFocusOf(
  ids: readonly string[] | null | undefined,
  depth: LodLevel,
): SceneHighlightFocus {
  if (!ids || ids.length === 0) return EMPTY_FOCUS

  const chipIds: string[] = []
  for (const id of ids) {
    if (id && !chipIds.includes(id)) chipIds.push(id)
  }

  const sceneHighlightIds: string[] = []
  for (const id of chipIds) {
    const visible = visibleAncestorAt(id, depth)
    if (visible && !sceneHighlightIds.includes(visible)) sceneHighlightIds.push(visible)
  }

  return { chipIds, sceneHighlightIds }
}

/** 场景 → 该深度下的高亮集合。`null` 场景（不在导览中）一律空集合。 */
export function sceneHighlightFocus(
  scene: ScenePreset | null | undefined,
  depth: LodLevel,
): SceneHighlightFocus {
  return highlightFocusOf(scene?.highlightAssemblyIds, depth)
}

/**
 * 组合式便捷入口：store 的三个字段 + 渲染深度 → 高亮集合（`null` = 无高亮）。
 *
 * `SceneRoot`（3D）与 `Fallback2D`（结构图）都走这一个入口，保证「?gl=off 与移动端
 * 降级路径也有场景高亮」——v1.2 之前降级路径只消费数据流高亮，导览站在那边是全黑的。
 */
export function sceneHighlightSet(
  mode: string,
  generation: string,
  tourStopIdx: number,
  depth: LodLevel,
  lens?: LensViewState | null,
): Set<string> | null {
  const focus =
    mode === 'lens'
      ? lensHighlightFocus(mode, generation, lens, depth)
      : sceneHighlightFocus(activeTourScene(mode, generation, tourStopIdx), depth)
  return focus.sceneHighlightIds.length > 0 ? new Set(focus.sceneHighlightIds) : null
}

/**
 * 切面章节点名的硬件（v1.6）——与导览走**同一套折叠**，因此高亮观感（`highlightKindOf`
 * 的 scene 通道、更低的自发光、instanced 路径的混色）全部免费继承，零新颜色。
 *
 * ★ 章节 pin 死了代际：正在渲染的系统与章节的 `systemId` 不一致时一律空集合。
 *   这种不一致理论上进不来（`setGeneration` 会把 `chapterIdx` 清成 -1），
 *   但比较模式的右视口渲染的确实是另一代，守一道成本为零。
 */
export function lensHighlightFocus(
  mode: string,
  generation: string,
  lens: LensViewState | null | undefined,
  depth: LodLevel,
): SceneHighlightFocus {
  const chapter = activeLensChapter(mode, lens)
  if (!chapter || chapter.systemId !== generation) return EMPTY_FOCUS
  return highlightFocusOf(chapter.highlightAssemblyIds, depth)
}
