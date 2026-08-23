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
import { detectWebGL } from './lib/webgl'

export type PlaneFlags = Record<NetworkPlane, boolean>

/** 'unknown' = 尚未探测；'failed' = 运行期 context lost 或初始化抛错。 */
export type GlStatus = 'unknown' | 'webgl2' | 'webgl' | 'none' | 'failed'

export type ExplorerMode = 'explore' | 'compare' | 'tour'

export const DEFAULT_SYSTEM_ID = FACTORY_PACK.systems[0]?.id ?? 'sys.gb300-nvl72'
/** 比较模式的默认右侧代际：内容包里的第二个系统（没有第二个就退回默认）。 */
export const DEFAULT_COMPARE_RIGHT_ID = FACTORY_PACK.systems[1]?.id ?? DEFAULT_SYSTEM_ID

/** 比较模式状态。**不落盘**：它是一次会话内的临时视角，不是用户偏好。 */
export interface CompareState {
  /** 右侧视口的系统 id（左侧恒为 `generation`）。 */
  right: string
  /** 只看有变化的部件：未变化的降为 ghost，DOM 列表也只留变化行。 */
  showDiffOnly: boolean
}

/**
 * 换代际时给右侧挑一个「不等于左侧」的系统，避免左右同代看不出差异。
 *
 * ⚠️ 同时兼任**清洗**职责（v1.3 W3）：`preferred` 可能是 `?right=` 传进来的垃圾、
 * 已删除的 systemId，或者恰好等于左侧——三种情况都要回落到一个合法的他系统，
 * 否则 `ComparePanel` 的 `<select>` 会拿到一个不在 options 里的 value（React 受控
 * 组件会显示成空白），比较视图也会左右同代。
 */
function otherSystemThan(systemId: string, preferred: string): string {
  const known = FACTORY_PACK.systems.some((s) => s.id === preferred)
  if (known && preferred !== systemId) return preferred
  return FACTORY_PACK.systems.find((s) => s.id !== systemId)?.id ?? systemId
}

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
  compare: CompareState
  /**
   * 数据流播放状态。`episodeIdx` = 当前播放哪个 `FlowEpisode`（索引进
   * `FACTORY_PACK.flows`；本批内容只有一条剧本，恒为 0，留给未来多剧本切换）；
   * `stepIdx` = 该 episode 内当前播放到第几个 `FlowStep`（批次 3 新增字段，
   * `FlowBar`/`FlowLayer` 的步骤条与粒子播放共同读写它）。
   */
  flow: { episodeIdx: number; stepIdx: number; playing: boolean; speed: number }
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
  /** 切换代际：换系统 = 换整棵装配树，因此下钻状态必须重置到该系统的根。 */
  setGeneration: (systemId: string) => void
  /**
   * 更新比较状态。`right` 会被清洗：未知 ID / 与左侧同代 一律回落到一个合法的他系统
   *（见 `otherSystemThan`），因此 `?right=` 这类外部输入可以直接喂进来。
   */
  setCompare: (patch: Partial<CompareState>) => void
  /**
   * **原子**交换比较双方：当前代际 ↔ 右侧代际。
   *
   * 为什么必须是一个独立 action 而不是「先 setGeneration 再 setCompare」：
   * `setGeneration` 自带「给右侧挑一个不等于左侧的系统」的逻辑，会把旧左侧冲掉，
   * 于是两步写法交换一次就丢了原来的左侧。这里在同一次 `set` 里把
   * 「新左 = 旧右、新右 = 旧左」一起落地，从而 **swap 两次必然复原**。
   * 换代际同样要重置下钻状态（新系统是另一棵装配树），但 `mode` / `showDiffOnly`
   * 是用户当前的视角偏好，交换左右不该把它们也重置掉。
   */
  swapCompareSides: () => void
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

/**
 * `glStatus` 必须在**首次渲染前**同步算出，不能留到 `useShotParams` 的 `useEffect` 里再定。
 *
 * ★ 这不是风格问题，是一个实测踩过的 bug：`useEffect` 排在首次 commit **之后**才跑，
 *   如果初始值是 'unknown'，`FactoryPage` 的 `degraded` 判定第一帧会算成 false，
 *   于是懒加载的 `<FactoryCanvas>`（进而 three-vendor chunk）会被**提前触发 import()**
 *   ——哪怕紧接着第二帧就把 `glStatus` 纠正成 'none'，那个网络请求已经发出去了，
 *   `?gl=off` 与探测失败两条路径「永不加载 three」的承诺就被开场这一帧破了。
 *   与下面 `reducedMotion` 用 `prefersReducedMotion()` 做初始种子是同一个模式。
 */
function initialGlStatus(): FactoryState['glStatus'] {
  if (typeof window === 'undefined') return 'unknown'
  return detectWebGL(window.location.search)
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
      compare: { right: DEFAULT_COMPARE_RIGHT_ID, showDiffOnly: false },
      flow: { episodeIdx: 0, stepIdx: 0, playing: false, speed: 1 },
      tourStopIdx: -1,
      reducedMotion: prefersReducedMotion(),
      glStatus: initialGlStatus(),
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
        // ★ 序号按**该系统内**的次序，不是全包的全局次序——三代并存后
        // TourPanel 列的是 scenesOfSystem(generation)，用全局序号会串代际高亮错行。
        const idx = FACTORY_PACK.scenes
          .filter((s) => s.systemId === scene.systemId)
          .findIndex((s) => s.id === sceneId)
        const planes = defaultPlanes()
        for (const key of PLANE_ORDER) planes[key] = scene.planes.includes(key)
        set((s) => ({
          ...nextState(s, {
            type: 'applyScene',
            level: scene.lodLevel,
            focusAssemblyId: scene.focusAssemblyId,
          }),
          generation: scene.systemId,
          planes,
          tourStopIdx: idx,
          mode: 'tour',
        }))
      },
      setTourStop: (idx) => set({ tourStopIdx: idx }),

      togglePlane: (plane) => set((s) => ({ planes: { ...s.planes, [plane]: !s.planes[plane] } })),
      setPlanes: (patch) => set((s) => ({ planes: { ...s.planes, ...patch } })),
      setMode: (mode) => set({ mode }),

      setGeneration: (systemId) =>
        set((s) => {
          if (s.generation === systemId) return s
          if (!FACTORY_PACK.systems.some((x) => x.id === systemId)) return s
          // 换代际 = 换一棵完全不同的装配树：旧的 focusPath/selectedId 在新系统里
          // 根本不存在，必须整体重置，否则详情面板与相机会指向一个不存在的节点。
          return {
            ...initialDrillState(systemId),
            generation: systemId,
            hoveredId: null,
            tourStopIdx: -1,
            flow: { ...s.flow, stepIdx: 0, playing: false },
            compare: { ...s.compare, right: otherSystemThan(systemId, s.compare.right) },
          }
        }),

      setCompare: (patch) =>
        set((s) => {
          const next = { ...s.compare, ...patch }
          // 清洗右侧：未知 ID（?right=sys.nope / 已删除的代际）或与左侧同代都不接受。
          return { compare: { ...next, right: otherSystemThan(s.generation, next.right) } }
        }),

      swapCompareSides: () =>
        set((s) => {
          const nextLeft = s.compare.right
          const nextRight = s.generation
          // 右侧本来就非法（理论上进不来，setCompare 已清洗）时不做任何事，
          // 免得把 generation 换成一个不存在的系统。
          if (!FACTORY_PACK.systems.some((x) => x.id === nextLeft)) return s
          if (nextLeft === nextRight) return s
          return {
            // 换系统 = 换整棵装配树：focusPath/selectedId 必须整体重置（同 setGeneration）。
            ...initialDrillState(nextLeft),
            generation: nextLeft,
            hoveredId: null,
            tourStopIdx: -1,
            flow: { ...s.flow, stepIdx: 0, playing: false },
            // ★ showDiffOnly 与 mode 保持不变：交换左右是换视角，不是换偏好。
            compare: { ...s.compare, right: nextRight },
          }
        }),

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
      // rehydrate 出来的 generation 可能不是默认代际，而 create() 里的初始下钻状态
      // 是按默认代际算的 —— 必须按落盘的代际重建，否则刷新后 focusPath 指向另一棵树的根。
      merge: (persisted, current) => {
        const slice = sanitizePersisted(persisted)
        return {
          ...current,
          ...slice,
          ...initialDrillState(slice.generation),
          compare: { right: otherSystemThan(slice.generation, DEFAULT_COMPARE_RIGHT_ID), showDiffOnly: false },
        }
      },
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
