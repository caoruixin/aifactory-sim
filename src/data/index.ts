import { COMPARISONS } from './comparisons'
import { FLOWS } from './flows'
import {
  GB300_ASSEMBLIES,
  GB300_COMPONENTS,
  GB300_CONNECTIONS,
  GB300_SCENES,
  GB300_SYSTEM,
} from './gb300-nvl72'
import {
  GROQ3_LPX_ASSEMBLIES,
  GROQ3_LPX_COMPONENTS,
  GROQ3_LPX_CONNECTIONS,
  GROQ3_LPX_SCENES,
  GROQ3_LPX_SYSTEM,
} from './groq3-lpx'
import { MODELS } from './models'
import {
  RUBIN_ULTRA_ASSEMBLIES,
  RUBIN_ULTRA_COMPONENTS,
  RUBIN_ULTRA_CONNECTIONS,
  RUBIN_ULTRA_SCENES,
  RUBIN_ULTRA_SYSTEM,
} from './rubin-ultra-nvl576'
import { SHARED_COMPONENTS } from './shared'
import { SOURCES } from './sources'
import {
  VERA_RUBIN_ASSEMBLIES,
  VERA_RUBIN_COMPONENTS,
  VERA_RUBIN_CONNECTIONS,
  VERA_RUBIN_SCENES,
  VERA_RUBIN_SYSTEM,
} from './vera-rubin-nvl72'
import type {
  AssemblyNode,
  Connection,
  FactoryContentPack,
  FactorySystem,
  FlowEpisode,
  HardwareComponent,
  ModelSpec,
  NetworkPlane,
  ScenePreset,
  SourceRef,
} from './types'

/**
 * 全量内容包。B2 起 3D 与 UI 只读这一个对象，不直接 import 各代际文件。
 *
 * ⚠️ 顺序有意义：`systems[0]` 是默认代际（GB300，唯一 shipping 的一代），
 * `scenes` 也按系统分组排列——`store.applyScene` 与 `TourPanel` 都按「系统内序号」取用。
 */
export const FACTORY_PACK: FactoryContentPack = {
  version: '0.2.0',
  generatedAsOf: '2026-08',
  sources: SOURCES,
  // ⚠️ 追加只能加在**尾部**：`systems[0]` 是默认代际，`systems[1]` 是比较模式的默认右侧，
  //    中间插入会让这两个约定连同截图基线一起漂移（content.test.ts 有 toEqual 锁）。
  systems: [GB300_SYSTEM, VERA_RUBIN_SYSTEM, RUBIN_ULTRA_SYSTEM, GROQ3_LPX_SYSTEM],
  components: [
    ...SHARED_COMPONENTS,
    ...GB300_COMPONENTS,
    ...VERA_RUBIN_COMPONENTS,
    ...RUBIN_ULTRA_COMPONENTS,
    ...GROQ3_LPX_COMPONENTS,
  ],
  assemblies: [
    ...GB300_ASSEMBLIES,
    ...VERA_RUBIN_ASSEMBLIES,
    ...RUBIN_ULTRA_ASSEMBLIES,
    ...GROQ3_LPX_ASSEMBLIES,
  ],
  connections: [
    ...GB300_CONNECTIONS,
    ...VERA_RUBIN_CONNECTIONS,
    ...RUBIN_ULTRA_CONNECTIONS,
    ...GROQ3_LPX_CONNECTIONS,
  ],
  flows: FLOWS,
  comparisons: COMPARISONS,
  scenes: [...GB300_SCENES, ...VERA_RUBIN_SCENES, ...RUBIN_ULTRA_SCENES, ...GROQ3_LPX_SCENES],
  models: MODELS,
}

// ─────────────────────────── byId 索引 ───────────────────────────
// 模块级构建一次即可：内容包是不可变的静态数据。

function indexBy<T extends { id: string }>(rows: T[]): ReadonlyMap<string, T> {
  return new Map(rows.map((r) => [r.id, r]))
}

const sourceIndex = indexBy(FACTORY_PACK.sources)
const systemIndex = indexBy(FACTORY_PACK.systems)
const componentIndex = indexBy(FACTORY_PACK.components)
const assemblyIndex = indexBy(FACTORY_PACK.assemblies)
const connectionIndex = indexBy(FACTORY_PACK.connections)
const sceneIndex = indexBy(FACTORY_PACK.scenes)
const modelIndex = indexBy(FACTORY_PACK.models)

// ─────────────────────────── 查询辅助（纯函数） ───────────────────────────

export function sourceById(id: string): SourceRef | undefined {
  return sourceIndex.get(id)
}

export function systemById(id: string): FactorySystem | undefined {
  return systemIndex.get(id)
}

export function componentById(id: string): HardwareComponent | undefined {
  return componentIndex.get(id)
}

export function assemblyById(id: string): AssemblyNode | undefined {
  return assemblyIndex.get(id)
}

export function connectionById(id: string): Connection | undefined {
  return connectionIndex.get(id)
}

export function sceneById(id: string): ScenePreset | undefined {
  return sceneIndex.get(id)
}

export function modelById(id: string): ModelSpec | undefined {
  return modelIndex.get(id)
}

/** 某系统的全部装配节点。 */
export function assembliesOfSystem(systemId: string): AssemblyNode[] {
  return FACTORY_PACK.assemblies.filter((a) => a.systemId === systemId)
}

/** 某系统装配树的根（每系统恰好一个，由 pack.test.ts 保证）。 */
export function rootAssemblyOf(systemId: string): AssemblyNode | undefined {
  return FACTORY_PACK.assemblies.find((a) => a.systemId === systemId && a.parentId === null)
}

/** 直接子节点，保持内容文件中的声明顺序。 */
export function childrenOf(assemblyId: string): AssemblyNode[] {
  return FACTORY_PACK.assemblies.filter((a) => a.parentId === assemblyId)
}

/** 从根到该节点的路径（含自身），用于面包屑。存在环时返回已收集到的部分。 */
export function ancestorsOf(assemblyId: string): AssemblyNode[] {
  const path: AssemblyNode[] = []
  const seen = new Set<string>()
  let cur = assemblyIndex.get(assemblyId)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.unshift(cur)
    cur = cur.parentId === null ? undefined : assemblyIndex.get(cur.parentId)
  }
  return path
}

/** 子树内全部节点（含自身），深度优先。 */
export function descendantsOf(assemblyId: string): AssemblyNode[] {
  const out: AssemblyNode[] = []
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const node = assemblyIndex.get(id)
    if (!node) return
    out.push(node)
    for (const child of childrenOf(id)) walk(child.id)
  }
  walk(assemblyId)
  return out
}

/**
 * 该节点的实例总数 = 沿祖先链的 count 连乘。
 *
 * @param scopeAssemblyId 计数的参照系（**不含**它自身的 count），省略则从装配树根算起。
 *   例：`totalInstances('asm.gb300.b300-gpu', 'asm.gb300.rack')` = 18 × 4 = 72（每机架 72 张卡）；
 *   省略 scope 则再乘上 rack 的 8 个 SU = 576。
 */
export function totalInstances(assemblyId: string, scopeAssemblyId?: string): number {
  const path = ancestorsOf(assemblyId)
  const scopeIdx = scopeAssemblyId ? path.findIndex((a) => a.id === scopeAssemblyId) : -1
  return path.slice(scopeIdx + 1).reduce((acc, node) => acc * node.count, 1)
}

/** 与该装配节点相连的全部连接（任一端命中）。 */
export function connectionsOf(assemblyId: string): Connection[] {
  return FACTORY_PACK.connections.filter(
    (c) => c.fromAssemblyId === assemblyId || c.toAssemblyId === assemblyId,
  )
}

/** 某系统在指定平面上的连接。 */
export function connectionsOfPlane(systemId: string, plane: NetworkPlane): Connection[] {
  return FACTORY_PACK.connections.filter((c) => c.systemId === systemId && c.plane === plane)
}

/** 某系统的导览场景。 */
export function scenesOfSystem(systemId: string): ScenePreset[] {
  return FACTORY_PACK.scenes.filter((s) => s.systemId === systemId)
}

/**
 * 某系统的数据流剧本。
 *
 * B4 起内容包有三个系统，而剧本目前只有 GB300 一套——`FlowBar` / `FlowLayer` /
 * `ConnectionLayer` 都必须按当前代际取剧本，否则切到 Vera Rubin 时会拿 GB300 的
 * 连接 ID 去当前系统里查路径（查不到 → 粒子静止），叙事与画面对不上。
 */
export function flowsOfSystem(systemId: string): FlowEpisode[] {
  return FACTORY_PACK.flows.filter((f) => f.systemId === systemId)
}

/** 当前代际的第 idx 个剧本；越界或该代际没有剧本时返回 undefined。 */
export function episodeOf(systemId: string, idx: number): FlowEpisode | undefined {
  return flowsOfSystem(systemId)[idx]
}

/** 该系统的机架装配节点（roleKey === 'rack'）。产能与比较的「每机架」口径都以它为参照系。 */
export function rackAssemblyOf(systemId: string): AssemblyNode | undefined {
  return FACTORY_PACK.assemblies.find((a) => a.systemId === systemId && a.roleKey === 'rack')
}

/** 引用了某组件的全部装配节点（详情面板「它在哪出现」用）。 */
export function assembliesUsingComponent(componentId: string): AssemblyNode[] {
  return FACTORY_PACK.assemblies.filter((a) => a.componentId === componentId)
}

/** 内容包统计摘要（占位首页与报告页用）。 */
export interface PackStats {
  sources: number
  systems: number
  components: number
  assemblies: number
  connections: number
  flows: number
  comparisons: number
  scenes: number
  models: number
}

export function packStats(pack: FactoryContentPack = FACTORY_PACK): PackStats {
  return {
    sources: pack.sources.length,
    systems: pack.systems.length,
    components: pack.components.length,
    assemblies: pack.assemblies.length,
    connections: pack.connections.length,
    flows: pack.flows.length,
    comparisons: pack.comparisons.length,
    scenes: pack.scenes.length,
    models: pack.models.length,
  }
}

export { DEFAULT_MODEL_ID } from './models'
export { BROKER_SOURCE_IDS, OFFICIAL_SOURCE_KINDS } from './sources'
