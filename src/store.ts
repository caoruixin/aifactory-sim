/**
 * 全局 UI 状态（zustand）。
 *
 * 三条硬规则：
 * 1. **每帧动画值绝不进 store**——粒子进度 / 相机插值 / 悬停高亮的 tween 一律留在
 *    R3F 的 ref 与 useFrame 里。store 只存「离散的、会引起 DOM 重渲染的」状态。
 * 2. 下钻转移全部委托 `lib/drill.ts` 的纯函数，store 只是它的宿主，
 *    这样状态机可以在 node 环境里单测。
 * 3. persist 只落盘用户偏好（planes / reducedMotion / generation），
 *    不落盘 level/focus/selected——刷新后回到干净的集群总览，避免旧 ID 把界面卡死。
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FACTORY_PACK, sceneById } from './data'
import type { LodLevel, NetworkPlane } from './data/types'
import type { DrillState } from './lib/drill'
import { initialDrillState, nextState } from './lib/drill'
import { PLANE_ORDER } from './lib/palette'

export type PlaneFlags = Record<NetworkPlane, boolean>

/** 'unknown' = 尚未探测；'failed' = 运行期 context lost 或初始化抛错。 */
export type GlStatus = 'unknown' | 'webgl2' | 'webgl' | 'none' | 'failed'

export type ExplorerMode = 'explore' | 'compare' | 'tour'

export const DEFAULT_SYSTEM_ID = FACTORY_PACK.systems[0]?.id ?? 'sys.gb300-nvl72'

/** 默认全开：先让用户看到「六个平面同时存在」，再靠开关做减法。 */
export function defaultPlanes(): PlaneFlags {
  return PLANE_ORDER.reduce((acc, p) => {
    acc[p] = true
    return acc
  }, {} as PlaneFlags)
}

export interface FactoryState extends DrillState {
  /** 当前代际 = FactorySystem.id。B4 起可切换。 */
  generation: string
  hoveredId: string | null
  planes: PlaneFlags
  mode: ExplorerMode
  /** B3 的数据流播放状态，本批只占位存态。 */
  flow: { episodeIdx: number; playing: boolean; speed: number }
  tourStopIdx: number
  reducedMotion: boolean
  glStatus: GlStatus
  /** 3D 首帧已出（或已确定走降级）。E2E 用容器上的 data-ready 等它。 */
  ready: boolean

  drillTo: (assemblyId: string) => void
  drillUp: () => void
  jumpTo: (assemblyId: string) => void
  select: (assemblyId: string | null) => void
  hover: (assemblyId: string | null) => void
  applyScene: (sceneId: string) => void
  setTourStop: (idx: number) => void
  togglePlane: (plane: NetworkPlane) => void
  setPlanes: (planes: Partial<PlaneFlags>) => void
  setMode: (mode: ExplorerMode) => void
  setFlow: (patch: Partial<FactoryState['flow']>) => void
  setReducedMotion: (v: boolean) => void
  setGlStatus: (s: GlStatus) => void
  setReady: (v: boolean) => void
  setLevel: (level: LodLevel) => void
  reset: () => void
}

/** `prefers-reduced-motion` 作为初始种子；用户之后可以显式覆盖并落盘。 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** 非浏览器环境（Vitest node / SSR）下的空存储，避免 persist 触碰不存在的 localStorage。 */
const memoryStore = new Map<string, string>()
const safeStorage = {
  getItem: (name: string): string | null =>
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(name)
      : (memoryStore.get(name) ?? null),
  setItem: (name: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(name, value)
    else memoryStore.set(name, value)
  },
  removeItem: (name: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(name)
    else memoryStore.delete(name)
  },
}

/** 落盘的那三项。 */
export interface PersistedSlice {
  planes: PlaneFlags
  reducedMotion: boolean
  generation: string
}

/**
 * rehydrate 清洗：老版本的 localStorage、被手改坏的值、已删除的 systemId
 * 都不能把界面打崩——一律回落到默认值。
 */
export function sanitizePersisted(raw: unknown): PersistedSlice {
  const fallback: PersistedSlice = {
    planes: defaultPlanes(),
    reducedMotion: false,
    generation: DEFAULT_SYSTEM_ID,
  }
  if (!raw || typeof raw !== 'object') return fallback
  const o = raw as Record<string, unknown>

  const planes = defaultPlanes()
  if (o.planes && typeof o.planes === 'object') {
    const p = o.planes as Record<string, unknown>
    for (const key of PLANE_ORDER) {
      if (typeof p[key] === 'boolean') planes[key] = p[key]
    }
  }

  const generation =
    typeof o.generation === 'string' && FACTORY_PACK.systems.some((s) => s.id === o.generation)
      ? o.generation
      : DEFAULT_SYSTEM_ID

  return {
    planes,
    reducedMotion: typeof o.reducedMotion === 'boolean' ? o.reducedMotion : false,
    generation,
  }
}

export const useFactoryStore = create<FactoryState>()(
  persist(
    (set) => ({
      ...initialDrillState(DEFAULT_SYSTEM_ID),
      generation: DEFAULT_SYSTEM_ID,
      hoveredId: null,
      planes: defaultPlanes(),
      mode: 'explore',
      flow: { episodeIdx: 0, playing: false, speed: 1 },
      tourStopIdx: -1,
      reducedMotion: prefersReducedMotion(),
      glStatus: 'unknown',
      ready: false,

      drillTo: (assemblyId) => set((s) => nextState(s, { type: 'drillTo', assemblyId })),
      drillUp: () => set((s) => nextState(s, { type: 'drillUp' })),
      jumpTo: (assemblyId) => set((s) => nextState(s, { type: 'jumpTo', assemblyId })),
      select: (assemblyId) => set((s) => nextState(s, { type: 'select', assemblyId })),
      hover: (assemblyId) => set((s) => (s.hoveredId === assemblyId ? s : { hoveredId: assemblyId })),
      setLevel: (level) => set({ level }),

      applyScene: (sceneId) => {
        const scene = sceneById(sceneId)
        if (!scene) return
        const idx = FACTORY_PACK.scenes.findIndex((s) => s.id === sceneId)
        const planes = defaultPlanes()
        for (const key of PLANE_ORDER) planes[key] = scene.planes.includes(key)
        set((s) => ({
          ...nextState(s, {
            type: 'applyScene',
            level: scene.lodLevel,
            focusAssemblyId: scene.focusAssemblyId,
          }),
          planes,
          tourStopIdx: idx,
          mode: 'tour',
        }))
      },
      setTourStop: (idx) => set({ tourStopIdx: idx }),

      togglePlane: (plane) => set((s) => ({ planes: { ...s.planes, [plane]: !s.planes[plane] } })),
      setPlanes: (patch) => set((s) => ({ planes: { ...s.planes, ...patch } })),
      setMode: (mode) => set({ mode }),
      setFlow: (patch) => set((s) => ({ flow: { ...s.flow, ...patch } })),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setGlStatus: (glStatus) => set({ glStatus }),
      setReady: (ready) => set((s) => (s.ready === ready ? s : { ready })),

      reset: () =>
        set((s) => ({
          ...nextState(s, { type: 'reset' }),
          hoveredId: null,
          tourStopIdx: -1,
          mode: 'explore' as const,
        })),
    }),
    {
      name: 'aifactory.ui.v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): PersistedSlice => ({
        planes: s.planes,
        reducedMotion: s.reducedMotion,
        generation: s.generation,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
)

/** 当前焦点节点 ID（focusPath 末位）。组件里高频用到，抽成选择器避免各处重复。 */
export function focusIdOf(s: Pick<FactoryState, 'focusPath'>): string | null {
  return s.focusPath[s.focusPath.length - 1] ?? null
}

/** 详情面板的目标：选中项优先，没有就退回当前焦点。 */
export function detailIdOf(s: Pick<FactoryState, 'focusPath' | 'selectedId'>): string | null {
  return s.selectedId ?? focusIdOf(s)
}
