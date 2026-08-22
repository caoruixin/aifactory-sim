/**
 * 下钻状态机（纯函数，零 three 导入）。
 *
 * 语义 LOD 的四级：cluster → rack → tray → board。
 * 「某个装配节点被聚焦时应该处在哪一级」不靠解析 ID，而由装配树结构推导——
 * 这样换代（Vera Rubin / Rubin Ultra）时不需要改一行下钻逻辑。
 *
 * 推导规则（`levelOfFocus`）：
 *   - 树根 → cluster；
 *   - 叶子节点 → 它自己的 lodLevel（「进不去了，就停在它所在的那一层」）；
 *   - 有子节点 → max(自身 lodLevel, 最粗的子节点 lodLevel)
 *     （即「至少能展开到子层」，但不会因为个别深层子孙就跳级）。
 *
 * 代入 GB300 校验：
 *   facility→cluster、row→cluster、rack→rack、compute-tray→tray、
 *   nvswitch-tray→tray、b300-gpu→board、power-shelf→rack、cdu→cluster。
 */

import { FACTORY_PACK, ancestorsOf, assemblyById, childrenOf } from '../data'
import type { AssemblyNode, FactoryContentPack, LodLevel } from '../data/types'

export const LEVEL_ORDER: readonly LodLevel[] = ['cluster', 'rack', 'tray', 'board']

export const LEVEL_LABEL: Record<LodLevel, string> = {
  cluster: '集群',
  rack: '机架',
  tray: '托盘',
  board: '板级',
}

export function levelIndex(level: LodLevel): number {
  return LEVEL_ORDER.indexOf(level)
}

export interface DrillState {
  level: LodLevel
  /** 从树根到当前焦点的完整 ID 链（含焦点自身）。空数组 = 尚未初始化。 */
  focusPath: string[]
  selectedId: string | null
}

export type DrillAction =
  /** 双击 / 详情面板「进入 →」：把焦点移到该节点并推进层级。 */
  | { type: 'drillTo'; assemblyId: string }
  /** 返回上一层（焦点跳到最近的、层级更浅的祖先）。 */
  | { type: 'drillUp' }
  /** 面包屑点击：直接跳到指定祖先。 */
  | { type: 'jumpTo'; assemblyId: string }
  /** 单击选中，不改变层级。 */
  | { type: 'select'; assemblyId: string | null }
  /** 导览场景应用：显式指定层级与焦点。 */
  | { type: 'applyScene'; level: LodLevel; focusAssemblyId: string | null }
  | { type: 'reset' }

// ─────────────────────────── 结构推导 ───────────────────────────

interface PackView {
  node: (id: string) => AssemblyNode | undefined
  kids: (id: string) => AssemblyNode[]
  chain: (id: string) => AssemblyNode[]
  root: (systemId: string) => AssemblyNode | undefined
}

function viewOf(pack: FactoryContentPack): PackView {
  if (pack === FACTORY_PACK) {
    return {
      node: assemblyById,
      kids: childrenOf,
      chain: ancestorsOf,
      root: (systemId) => FACTORY_PACK.assemblies.find((a) => a.systemId === systemId && a.parentId === null),
    }
  }
  const byId = new Map(pack.assemblies.map((a) => [a.id, a]))
  return {
    node: (id) => byId.get(id),
    kids: (id) => pack.assemblies.filter((a) => a.parentId === id),
    chain: (id) => {
      const out: AssemblyNode[] = []
      const seen = new Set<string>()
      let cur = byId.get(id)
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id)
        out.unshift(cur)
        cur = cur.parentId === null ? undefined : byId.get(cur.parentId)
      }
      return out
    },
    root: (systemId) => pack.assemblies.find((a) => a.systemId === systemId && a.parentId === null),
  }
}

/** 聚焦该节点时应处的 LOD 层级。 */
export function levelOfFocus(assemblyId: string, pack: FactoryContentPack = FACTORY_PACK): LodLevel {
  const v = viewOf(pack)
  const node = v.node(assemblyId)
  if (!node) return 'cluster'
  if (node.parentId === null) return 'cluster'
  const kids = v.kids(assemblyId)
  if (kids.length === 0) return node.lodLevel
  const own = levelIndex(node.lodLevel)
  const shallowestKid = Math.min(...kids.map((k) => levelIndex(k.lodLevel)))
  return LEVEL_ORDER[Math.max(own, shallowestKid)] ?? node.lodLevel
}

/** 该节点是否还能再往里钻（存在子节点且子节点会推进层级）。 */
export function canDrillInto(assemblyId: string, pack: FactoryContentPack = FACTORY_PACK): boolean {
  const v = viewOf(pack)
  const kids = v.kids(assemblyId)
  if (kids.length === 0) return false
  const here = levelIndex(levelOfFocus(assemblyId, pack))
  return kids.some((k) => levelIndex(levelOfFocus(k.id, pack)) > here)
}

/**
 * 场景挂载锚点：3D 侧按它决定挂哪一棵子树（语义 LOD = React 挂载/卸载）。
 * - cluster：只挂机架壳与机房设施；
 * - rack：挂焦点机架的全部 U 位设备；
 * - tray：挂焦点托盘的板级内部（board 级额外应用 explode 偏移）。
 */
export type SceneAnchor =
  | { kind: 'cluster' }
  | { kind: 'rack'; rackAssemblyId: string }
  | { kind: 'tray'; trayAssemblyId: string; exploded: boolean }

/** 最深的「其子节点里有 rack 层设备」的祖先或自身——GB300 里就是机架节点。 */
export function rackContainerOf(
  assemblyId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): string | null {
  const v = viewOf(pack)
  const chain = v.chain(assemblyId)
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const n = chain[i]!
    if (v.kids(n.id).some((k) => k.lodLevel === 'rack')) return n.id
  }
  return null
}

/** 最深的「自身处于 rack 层且有内部结构」的祖先或自身——即计算/交换托盘。 */
export function trayContainerOf(
  assemblyId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): string | null {
  const v = viewOf(pack)
  const chain = v.chain(assemblyId)
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const n = chain[i]!
    if (n.lodLevel === 'rack' && v.kids(n.id).length > 0) return n.id
  }
  return null
}

export function sceneAnchorOf(
  state: DrillState,
  pack: FactoryContentPack = FACTORY_PACK,
): SceneAnchor {
  const focusId = state.focusPath[state.focusPath.length - 1]
  if (!focusId || state.level === 'cluster') return { kind: 'cluster' }
  if (state.level === 'rack') {
    const rackId = rackContainerOf(focusId, pack)
    return rackId ? { kind: 'rack', rackAssemblyId: rackId } : { kind: 'cluster' }
  }
  const trayId = trayContainerOf(focusId, pack)
  if (trayId) return { kind: 'tray', trayAssemblyId: trayId, exploded: state.level === 'board' }
  const rackId = rackContainerOf(focusId, pack)
  return rackId ? { kind: 'rack', rackAssemblyId: rackId } : { kind: 'cluster' }
}

// ─────────────────────────── 面包屑 ───────────────────────────

export interface Crumb {
  assemblyId: string
  label: string
  level: LodLevel
  /** 当前焦点本身。 */
  current: boolean
}

/** focusPath → 面包屑（复用 data 层的 ancestorsOf，不重写树遍历）。 */
export function crumbsOf(focusPath: readonly string[], pack: FactoryContentPack = FACTORY_PACK): Crumb[] {
  const focusId = focusPath[focusPath.length - 1]
  if (!focusId) return []
  const v = viewOf(pack)
  const chain = v.chain(focusId)
  return chain.map((n, i) => ({
    assemblyId: n.id,
    label: n.label,
    level: levelOfFocus(n.id, pack),
    current: i === chain.length - 1,
  }))
}

// ─────────────────────────── 状态转移 ───────────────────────────

export function initialDrillState(
  systemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): DrillState {
  const root = viewOf(pack).root(systemId)
  return { level: 'cluster', focusPath: root ? [root.id] : [], selectedId: null }
}

function focusTo(assemblyId: string, pack: FactoryContentPack, prev: DrillState): DrillState {
  const v = viewOf(pack)
  const node = v.node(assemblyId)
  if (!node) return prev // 非法 ID：状态不变（深链参数写错时不该把界面打崩）
  const chain = v.chain(assemblyId)
  return {
    level: levelOfFocus(assemblyId, pack),
    focusPath: chain.map((n) => n.id),
    selectedId: assemblyId,
  }
}

export function nextState(
  state: DrillState,
  action: DrillAction,
  pack: FactoryContentPack = FACTORY_PACK,
): DrillState {
  const v = viewOf(pack)
  switch (action.type) {
    case 'drillTo':
      return focusTo(action.assemblyId, pack, state)

    case 'jumpTo': {
      const next = focusTo(action.assemblyId, pack, state)
      // 面包屑回跳不应该顺手改选中项之外的东西；选中项跟随焦点是刻意的（右栏立刻有内容）。
      return next
    }

    case 'drillUp': {
      const focusId = state.focusPath[state.focusPath.length - 1]
      if (!focusId) return state
      const here = levelIndex(state.level)
      if (here <= 0) return state // 已在 cluster：无处可退
      const targetLevel = LEVEL_ORDER[here - 1]!
      const chain = v.chain(focusId)
      // 优先回到「恰好是上一级」的祖先。从根往下找 ⇒ 命中最外层的那个，
      // 例如从 rack 退出时落到「机房」而不是中间的「机架列」（两者同为 cluster 级）。
      for (let i = 0; i < chain.length - 1; i += 1) {
        if (levelOfFocus(chain[i]!.id, pack) === targetLevel) return focusTo(chain[i]!.id, pack, state)
      }
      // 树形不规则时兜底：退到最近的更浅祖先。
      for (let i = chain.length - 2; i >= 0; i -= 1) {
        if (levelIndex(levelOfFocus(chain[i]!.id, pack)) < here) return focusTo(chain[i]!.id, pack, state)
      }
      return state
    }

    case 'select': {
      if (action.assemblyId === null) return { ...state, selectedId: null }
      return v.node(action.assemblyId) ? { ...state, selectedId: action.assemblyId } : state
    }

    case 'applyScene': {
      if (action.focusAssemblyId === null) return { ...state, level: action.level }
      const next = focusTo(action.focusAssemblyId, pack, state)
      if (next === state) return state
      // 导览场景显式声明层级（例如「一个计算托盘里有什么」要求 board 级拆解视图），
      // 它优先于结构推导出的层级。
      return { ...next, level: action.level }
    }

    case 'reset': {
      const focusId = state.focusPath[0]
      const node = focusId ? v.node(focusId) : undefined
      return node ? initialDrillState(node.systemId, pack) : state
    }

    default:
      return state
  }
}
