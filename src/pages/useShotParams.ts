/**
 * URL 参数 → store 的**一次性**播种。
 *
 * 三个用途：
 * 1. 深链——`/?level=board&focus=asm.gb300.b300-gpu` 直接把人送到某一屏，
 *    汇报时不用现场点五下；
 * 2. **学习手册的任务卡**（v1.3 W2）——`?tour=scene.gb300.learn-plane-nvlink`
 *    一步落到某个导览站（层级、焦点、平面、讲解文案、场景高亮一次到位），
 *    手册里每张练习卡的「▶ 打开」就是这个参数；v1.6 起同一角色多了一个
 *    `?lens=network&chapter=1`（领域切面第 1 章，同样一次到位，含代际切换）；
 * 3. 截图/E2E 的确定性入口——`?motion=off&gl=off` 可以关掉相机动画与 WebGL，
 *    让 Playwright 基线不受动画时序影响。
 *
 * 「一次性」很重要：播种之后用户的手动操作不应该被 URL 覆盖，
 * 因此这里不做双向同步（URL ← store 的回写留给后续批次按需加）。
 */

import { useEffect, useRef } from 'react'
import { assemblyById, lensById, sceneById, scenesOfSystem, systemById } from '../data'
import type { LensChapter, LodLevel, NetworkPlane } from '../data/types'
import { LEVEL_ORDER } from '../lib/drill'
import { lensChapterAt, lensChapterCount, resolveLensId } from '../lib/lens'
import { PLANE_ORDER } from '../lib/palette'
import { detectWebGL } from '../lib/webgl'
import { useFactoryStore } from '../store'
import type { ExplorerMode, PlaneFlags } from '../store'

export interface ShotParams {
  level: LodLevel | null
  focus: string | null
  planes: NetworkPlane[] | null
  motionOff: boolean
  glOff: boolean
  /** `?gen=sys.vera-rubin-nvl72`：直接落到某一代际。 */
  generation: string | null
  /** `?mode=compare`：直接进比较模式。 */
  mode: ExplorerMode | null
  /** `?right=sys.rubin-ultra-nvl576`：比较模式的右侧代际。 */
  compareRight: string | null
  /** `?tour=scene.gb300.learn-plane-nvlink`：直接落到某个导览站（v1.3 W2）。 */
  tour: string | null
  /** `?lens=network`：直接落到某条领域切面（v1.6）。短名与全 id 都接受。 */
  lens: string | null
  /** `?chapter=2`：切面章节序号，**1 起算**（面向手册读者，不是数组下标）。 */
  chapter: number | null
}

const MODES: readonly ExplorerMode[] = ['explore', 'compare', 'tour', 'lens']

/** 纯解析，不碰 store。 */
export function parseShotParams(search: string): ShotParams {
  const q = new URLSearchParams(search)
  const rawLevel = q.get('level')
  const level = rawLevel && (LEVEL_ORDER as readonly string[]).includes(rawLevel)
    ? (rawLevel as LodLevel)
    : null

  const rawPlanes = q.get('planes')
  const planes = rawPlanes
    ? rawPlanes
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is NetworkPlane => (PLANE_ORDER as readonly string[]).includes(s))
    : null

  const rawMode = q.get('mode')
  const mode = rawMode && (MODES as readonly string[]).includes(rawMode) ? (rawMode as ExplorerMode) : null

  // 章节号只接受十进制整数；`?chapter=abc` 与缺省一样交给 applyShotParams 回落到第 1 章。
  const rawChapter = q.get('chapter')
  const chapter = rawChapter !== null && /^-?\d+$/.test(rawChapter.trim()) ? Number(rawChapter) : null

  return {
    level,
    focus: q.get('focus'),
    planes,
    motionOff: q.get('motion') === 'off',
    glOff: q.get('gl') === 'off',
    generation: q.get('gen'),
    mode,
    compareRight: q.get('right'),
    tour: q.get('tour'),
    lens: q.get('lens'),
    chapter,
  }
}

/**
 * `?chapter=` → 该切面内的章节下标。**1 起算**（手册里写「第 2 章」，链接就写 2），
 * 缺省与越界一律回落第 1 章——深链写错时给一个能用的起点，比空态友好。
 */
function seedChapterOf(lensId: string, raw: number | null): { idx: number; chapter: LensChapter } | null {
  const total = lensChapterCount(lensId)
  if (total === 0) return null
  const wanted = raw ?? 1
  const idx = Number.isInteger(wanted) && wanted >= 1 && wanted <= total ? wanted - 1 : 0
  const chapter = lensChapterAt(lensId, idx)
  return chapter ? { idx, chapter } : null
}

/**
 * 把解析结果落到 store（`glStatus` / `reducedMotion` 以外的全部导航状态）。
 *
 * ★ 单独导出、不依赖 `window`：优先级矩阵与跨系统规则要能在 node 环境里单测
 *   （见 `useShotParams.test.ts`），不能只存在于 `useEffect` 里。
 *
 * ─────────────────────────── 优先级矩阵（**规范，改代码先改这里**）───────────────────────────
 *
 * **基座**一次性写入 generation / planes / level / focus / 模式与站号，有两种、且**互斥**：
 *   `?lens=&chapter=`（切面章节，v1.6）与 `?tour=`（导览站，v1.3 W2）。
 * 其余显式参数在基座之上**逐项覆盖**，落地顺序如下（顺序本身就是矩阵的一部分）：
 *
 *   ⓪ lens        → `store.setLens(lensId, idx)`；**lens 与 tour 同时出现时 lens 赢**，
 *                   tour 整条忽略（两个基座都写 level/focus/planes/mode，混着播必然打架；
 *                   切面是 v1.6 的新入口，手册链接以它为准）。未知 lens 整条忽略。
 *                   `?chapter=` 1 起算，缺省/越界回落第 1 章。
 *   ① tour        → `store.applyScene`（未知 scene id 直接忽略，不报错、不清场）
 *   ② gen         → `store.setGeneration`；与基座所属系统不同即触发下面的**跨系统规则**
 *   ③ planes      → 覆盖基座写入的平面集合（必须排在 ⓪① 之后，否则被冲掉）
 *   ④ right       → 比较模式右侧代际
 *   ⑤ focus       → 必须属于**最终** generation，跨系统的 focus **忽略**（不报错）
 *   ⑥ level       → 覆盖 focus 推导出的层级（因此排在 ⑤ 之后）
 *   ⑦ mode        → **最后**落地，从而显式 `?mode=explore` 能盖掉基座强制的 'tour'/'lens'；
 *                   **`mode=lens` 只在此刻真的有激活章节时才接受**（`lensId` 非空且
 *                   `chapterIdx >= 0`），否则忽略——「切面模式却没有章节」是空壳。
 *
 * **跨系统规则 A**（`?tour=` 与 `?gen=` 指向不同系统时）：
 *   场景序号**绝不跨系统复用**——`setGeneration` 已把 `tourStopIdx` 清成 -1，这里不再补回。
 *   接下来按**显式 mode** 决定：
 *     · 显式 `mode=tour`  → 进入**新系统的首站**（`applyScene(scenesOfSystem(gen)[0])`）；
 *     · 显式其它 mode     → 由 ⑦ 落地，场景保持清空；
 *     · **无显式 mode**   → **退出导览**，回落 `'explore'`。
 *       理由：用户显式指定了另一个系统，替他挑一站等于替他选了没要的内容；而
 *       `mode='tour'` + `tourStopIdx=-1` 并存会让左栏出现「导览中却没有当前站」的空态。
 *
 * **跨系统规则 B**（`?lens=` 的章节 pin 的代际与 `?gen=` 不同时）：
 *   章节序号同样绝不跨代复用——`setGeneration` 已把 `lens.chapterIdx` 清成 -1。三分支：
 *     · 显式 `mode=lens`  → 跳到该切面里**第一个同代章节**；一个都没有则退 `'explore'`
 *                          （切面章节可以跨代，但不是每代都有章）；
 *     · 显式其它 mode     → 由 ⑦ 落地，章节保持清空；
 *     · **无显式 mode**   → 退 `'explore'`（同规则 A 的理由）。
 */
export function applyShotParams(params: ShotParams): void {
  const store = useFactoryStore.getState()

  // ⓪ lens 基座（与 ① 互斥，lens 赢）
  const seededLensId = resolveLensId(params.lens)
  const seededChapter = seededLensId ? seedChapterOf(seededLensId, params.chapter) : null
  if (seededLensId && seededChapter) store.setLens(seededLensId, seededChapter.idx)

  // ① tour 基座（只有在没有合法 lens 时才落地）
  const seededScene = !seededChapter && params.tour ? (sceneById(params.tour) ?? null) : null
  if (seededScene) store.applyScene(seededScene.id)

  // ② 显式代际覆盖（换系统 = 换整棵装配树，必须排在 focus/level 之前）
  if (params.generation && systemById(params.generation)) store.setGeneration(params.generation)
  const generation = useFactoryStore.getState().generation

  // 跨系统规则 A（导览）
  if (seededScene && seededScene.systemId !== generation) {
    if (params.mode === 'tour') {
      const first = scenesOfSystem(generation)[0]
      if (first) store.applyScene(first.id)
    } else if (params.mode === null) {
      store.setMode('explore')
    }
    // 显式 explore/compare 交给 ⑦ 统一落地
  }

  // 跨系统规则 B（切面）
  if (seededLensId && seededChapter && seededChapter.chapter.systemId !== generation) {
    if (params.mode === 'lens') {
      const idx = lensById(seededLensId)?.chapters.findIndex((c) => c.systemId === generation) ?? -1
      if (idx >= 0) store.setLens(seededLensId, idx)
      else store.setMode('explore') // 这一代在本切面里没有章节：退出，⑦ 会因 chapterIdx=-1 拒绝 mode=lens
    } else if (params.mode === null) {
      store.setMode('explore')
    }
    // 显式 explore/compare/tour 交给 ⑦ 统一落地
  }

  // ③ 显式平面
  if (params.planes) {
    const flags = PLANE_ORDER.reduce((acc, p) => {
      acc[p] = params.planes!.includes(p)
      return acc
    }, {} as PlaneFlags)
    store.setPlanes(flags)
  }

  // ④ 比较右侧
  if (params.compareRight) store.setCompare({ right: params.compareRight })

  // ⑤ 焦点：必须属于**最终** generation，否则忽略（跨系统深链不该把界面指到另一棵树）
  if (params.focus) {
    const node = assemblyById(params.focus)
    if (node && node.systemId === generation) store.drillTo(params.focus)
  }

  // ⑥ 层级
  if (params.level) store.setLevel(params.level)

  // ⑦ 显式 mode 最后落地（覆盖基座强制的 'tour' / 'lens'）
  if (params.mode === 'lens') {
    // `mode=lens` 只在真的有激活章节时接受：没有 `?lens=`（或跨代冲突把章节清空了）时
    // 进切面模式只会得到一个左栏空转、右栏空态的壳。
    const lens = useFactoryStore.getState().lens
    if (lens.lensId && lens.chapterIdx >= 0) store.setMode('lens')
  } else if (params.mode) {
    store.setMode(params.mode)
  }
}

export function useShotParams(): void {
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true

    const search = typeof window === 'undefined' ? '' : window.location.search
    const params = parseShotParams(search)
    const store = useFactoryStore.getState()

    // WebGL：显式关闭优先，否则跑一次能力探测。
    store.setGlStatus(params.glOff ? 'none' : detectWebGL(search))
    if (params.glOff) store.setReady(true) // 没有 Canvas 就没有首帧回调

    if (params.motionOff) store.setReducedMotion(true)

    applyShotParams(params)
  }, [])
}
