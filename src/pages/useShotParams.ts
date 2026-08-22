/**
 * URL 参数 → store 的**一次性**播种。
 *
 * 两个用途合一：
 * 1. 深链——`/?level=board&focus=asm.gb300.b300-gpu` 直接把人送到某一屏，
 *    汇报时不用现场点五下；
 * 2. 截图/E2E 的确定性入口——`?motion=off&gl=off` 可以关掉相机动画与 WebGL，
 *    让 B5 的 Playwright 基线不受动画时序影响。
 *
 * 「一次性」很重要：播种之后用户的手动操作不应该被 URL 覆盖，
 * 因此这里不做双向同步（URL ← store 的回写留给后续批次按需加）。
 */

import { useEffect, useRef } from 'react'
import { assemblyById } from '../data'
import type { LodLevel, NetworkPlane } from '../data/types'
import { LEVEL_ORDER } from '../lib/drill'
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
}

const MODES: readonly ExplorerMode[] = ['explore', 'compare', 'tour']

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

  return {
    level,
    focus: q.get('focus'),
    planes,
    motionOff: q.get('motion') === 'off',
    glOff: q.get('gl') === 'off',
    generation: q.get('gen'),
    mode,
    compareRight: q.get('right'),
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

    if (params.planes) {
      const flags = PLANE_ORDER.reduce((acc, p) => {
        acc[p] = params.planes!.includes(p)
        return acc
      }, {} as PlaneFlags)
      store.setPlanes(flags)
    }

    // 代际最先：它会重建整棵下钻状态，放在 focus/level 之后会把它们冲掉。
    if (params.generation) store.setGeneration(params.generation)
    if (params.compareRight) store.setCompare({ right: params.compareRight })
    if (params.mode) store.setMode(params.mode)

    // 焦点先于层级：层级由焦点的结构位置推导，显式 level 再覆盖一次。
    if (params.focus && assemblyById(params.focus)) store.drillTo(params.focus)
    if (params.level) store.setLevel(params.level)
  }, [])
}
