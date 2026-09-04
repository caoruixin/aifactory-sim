/**
 * 代际比较：按 `AssemblyNode.roleKey` 自动配对两个系统的装配树（纯函数，零 three 导入）。
 *
 * ★ 三条纪律
 * 1. **只用 roleKey 配对，永不解析 ID 字符串**。`asm.gb300.cx8-nic` 与 `asm.rubin.cx9-nic`
 *    之所以能配上，是因为两边的 roleKey 都是 `scaleout-nic`，而不是因为名字长得像。
 * 2. **一侧「官方未公布」不算变化**。Claim 的 `value: null` 语义是「这个源没说」，
 *    把它当成「从 1800 变成了 0」是本项目最不能犯的错误——它会让汇报的人说出
 *    「新一代带宽掉了」这种致命结论。这类键单独进 `unknownKeys`，不进 `specDeltas.changed`。
 * 3. **`added` / `removed` 只描述内容包，不描述现实**。右侧没建模某个 roleKey，只说明
 *    本项目没收录（通常是官方未公布），不代表那台机器上没有这个东西。UI 与
 *    `ComparisonDefinition.rows[].narrative` 必须把这层含义讲清楚。
 */

import { FACTORY_PACK } from '../data'
import type {
  AssemblyNode,
  Claim,
  ComparisonDefinition,
  FactoryContentPack,
  HardwareComponent,
  ProductStatus,
} from '../data/types'

// ─────────────────────────── 输出类型 ───────────────────────────

export type DiffKind = 'added' | 'removed' | 'qty-changed' | 'spec-changed' | 'unchanged'

export const DIFF_LABEL: Record<DiffKind, string> = {
  added: '新增',
  removed: '未收录',
  'qty-changed': '数量变化',
  'spec-changed': '规格变化',
  unchanged: '无变化',
}

/** diff 类别 → palette token（3D 描边与 DOM 徽章共用一套语义色）。 */
export const DIFF_TOKEN: Record<DiffKind, string | null> = {
  added: 'ok',
  removed: 'bad',
  'qty-changed': 'accent-2',
  'spec-changed': 'accent',
  unchanged: null,
}

/**
 * 「这张表没有人工叙述」的统一警示文案。
 *
 * 比较面板（用户把左右调成没有定义的组合时）与 `/report` §04（人工定义里恰好没写
 * summary 时）共用同一句——一张只有配对结果、没有叙述的 diff 表极易被读成
 * 「新一代砍掉了这些部件」，两处必须给同一个提醒，不能各写各的。
 */
export const AUTO_DIFF_NOTICE =
  '这一对组合没有写过人工比较定义（或方向与定义相反），下面是纯自动 diff——只有配对结果，没有叙述。把左右调回定义方向即可看到汇报要点。'

export const DIFF_ORDER: readonly DiffKind[] = [
  'added',
  'removed',
  'qty-changed',
  'spec-changed',
  'unchanged',
]

export interface DiffSide {
  assemblyId: string
  label: string
  note: string | null
  componentId: string
  componentName: string
  status: ProductStatus
  /** 每个父实例下的数量。 */
  count: number
  /** 机架内总数（该节点没有机架祖先时，退化为系统内总数）。 */
  total: number
  totalScope: 'rack' | 'system'
}

/**
 * 一条规格键的两侧对照。
 * `unknown` 是一等公民：至少一侧 `value === null`（官方未公布）⇒ 不构成「变化」。
 */
export interface SpecDelta {
  key: string
  left: Claim | null
  right: Claim | null
  kind: 'changed' | 'unknown' | 'same'
}

export interface DiffRow {
  roleKey: string
  kind: DiffKind
  label: string
  left: DiffSide | null
  right: DiffSide | null
  qtyChanged: boolean
  specChanged: boolean
  /** 两侧引用了不同的组件（例如 ConnectX-8 → ConnectX-9）。 */
  componentChanged: boolean
  specDeltas: SpecDelta[]
  /** 因「一侧官方未公布」而无法比较的规格键。 */
  unknownKeys: string[]
  /** `ComparisonDefinition.rows` 里的人工叙述覆盖；null = 用 `summary` 的自动文案。 */
  narrative: string | null
  summary: string
}

export interface ComparisonResult {
  id: string
  title: string
  leftSystemId: string
  rightSystemId: string
  leftName: string
  rightName: string
  leftStatus: ProductStatus
  rightStatus: ProductStatus
  summary: string[]
  rows: DiffRow[]
  counts: Record<DiffKind, number>
}

// ─────────────────────────── 配对 ───────────────────────────

/**
 * 某系统的 roleKey → 装配节点索引。
 *
 * **每个 roleKey 在一个系统内至多一个节点**——这条不变量由 `pack.test.ts` 强制，
 * 这里遇到重复时保留声明顺序中的第一个（保证纯函数的确定性，不抛异常把界面打崩）。
 */
export function assembliesByRoleKey(
  systemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): Map<string, AssemblyNode> {
  const out = new Map<string, AssemblyNode>()
  for (const a of pack.assemblies) {
    if (a.systemId !== systemId) continue
    if (!out.has(a.roleKey)) out.set(a.roleKey, a)
  }
  return out
}

/** 机架祖先（roleKey === 'rack'）之下的实例总数；没有机架祖先时按系统内总数。 */
function scopedTotal(
  node: AssemblyNode,
  pack: FactoryContentPack,
): { total: number; scope: 'rack' | 'system' } {
  const byId = new Map(pack.assemblies.map((a) => [a.id, a]))
  const chain: AssemblyNode[] = []
  const seen = new Set<string>()
  let cur: AssemblyNode | undefined = node
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    chain.unshift(cur)
    cur = cur.parentId === null ? undefined : byId.get(cur.parentId)
  }
  const rackIdx = chain.findIndex((n) => n.roleKey === 'rack')
  // 机架节点自身：按系统内数量（有几个机架）计。
  if (rackIdx >= 0 && chain[rackIdx]!.id !== node.id) {
    let total = 1
    for (const n of chain.slice(rackIdx + 1)) total *= n.count
    return { total, scope: 'rack' }
  }
  let total = 1
  for (const n of chain.slice(1)) total *= n.count // 跳过根（机房，count 恒为 1）
  return { total, scope: 'system' }
}

function sideOf(
  node: AssemblyNode,
  components: Map<string, HardwareComponent>,
  pack: FactoryContentPack,
): DiffSide {
  const component = components.get(node.componentId)
  const { total, scope } = scopedTotal(node, pack)
  return {
    assemblyId: node.id,
    label: node.label,
    note: node.note,
    componentId: node.componentId,
    componentName: component?.name ?? node.componentId,
    status: component?.status ?? 'shipping',
    count: node.count,
    total,
    totalScope: scope,
  }
}

// ─────────────────────────── 规格对照 ───────────────────────────

function sameClaimValue(a: Claim, b: Claim): boolean {
  if (typeof a.value === 'number' && typeof b.value === 'number') {
    return Math.abs(a.value - b.value) < 1e-9
  }
  return a.value === b.value
}

/**
 * 两个组件的规格对照。**只比较两边都登记了的键**——
 * 键名不同（例如 `hbmPerGpuGB` vs `hbm4PerGpuGB`）本质上是「没法比」，
 * 硬凑成一条 diff 只会制造噪音。因此内容包里语义相同的规格必须**故意复用同一个键名**。
 */
export function specDeltasOf(
  left: HardwareComponent | undefined,
  right: HardwareComponent | undefined,
): SpecDelta[] {
  if (!left || !right) return []
  const keys = Object.keys(left.specs).filter((k) => k in right.specs)
  return keys.map((key) => {
    const l = left.specs[key]!
    const r = right.specs[key]!
    if (l.value === null || r.value === null) return { key, left: l, right: r, kind: 'unknown' as const }
    return { key, left: l, right: r, kind: sameClaimValue(l, r) ? ('same' as const) : ('changed' as const) }
  })
}

// ─────────────────────────── 自动文案 ───────────────────────────

function formatClaim(c: Claim | null): string {
  if (!c) return '—'
  if (c.value === null) return '官方未公布'
  if (typeof c.value === 'boolean') return c.value ? '是' : '否'
  const v = typeof c.value === 'number' ? c.value.toLocaleString('zh-CN') : c.value
  return c.unit ? `${v} ${c.unit}` : String(v)
}

function summaryOf(row: Omit<DiffRow, 'summary' | 'narrative'>): string {
  const { left, right } = row
  const scopeLabel = (s: DiffSide) => (s.totalScope === 'rack' ? '每机架' : '全系统')
  switch (row.kind) {
    case 'added':
      return right
        ? `右侧新增：${right.label}（${right.componentName}，${scopeLabel(right)} ${right.total}）。左侧内容包中没有这一 roleKey。`
        : '右侧新增。'
    case 'removed':
      return left
        ? `右侧内容包未收录 ${left.label}（左侧 ${scopeLabel(left)} ${left.total}）——通常是官方尚未公布该层细节，不代表实机没有这个部件。`
        : '右侧未收录。'
    case 'qty-changed': {
      const parts = [`${scopeLabel(left!)}数量 ${left!.total} → ${right!.total}`]
      if (row.componentChanged) parts.push(`${left!.componentName} → ${right!.componentName}`)
      const changed = row.specDeltas.filter((d) => d.kind === 'changed')
      if (changed.length > 0) {
        parts.push(
          changed
            .slice(0, 2)
            .map((d) => `${d.key} ${formatClaim(d.left)} → ${formatClaim(d.right)}`)
            .join('；'),
        )
      }
      return `${parts.join('；')}。`
    }
    case 'spec-changed': {
      const parts: string[] = []
      if (row.componentChanged) parts.push(`${left!.componentName} → ${right!.componentName}`)
      for (const d of row.specDeltas.filter((x) => x.kind === 'changed').slice(0, 3)) {
        parts.push(`${d.key} ${formatClaim(d.left)} → ${formatClaim(d.right)}`)
      }
      if (parts.length === 0) parts.push('规格有差异')
      return `${parts.join('；')}。`
    }
    default: {
      const unknown = row.unknownKeys.length
      const base = `${scopeLabel(left!)}数量与已登记规格均无变化（${left!.total}）。`
      return unknown > 0
        ? `${base}另有 ${unknown} 项因一侧官方未公布而无法比较（不计为变化）。`
        : base
    }
  }
}

// ─────────────────────────── 主入口 ───────────────────────────

/**
 * 两个系统的 roleKey 级 diff。行顺序：左侧声明顺序优先，右侧独有的追加在后
 * ——保证同一对系统每次得到逐位相同的结果（截图基线与测试都依赖这个确定性）。
 */
export function diffSystems(
  leftSystemId: string,
  rightSystemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): DiffRow[] {
  const components = new Map(pack.components.map((c) => [c.id, c]))
  const leftMap = assembliesByRoleKey(leftSystemId, pack)
  const rightMap = assembliesByRoleKey(rightSystemId, pack)

  const roleKeys: string[] = [...leftMap.keys()]
  for (const k of rightMap.keys()) if (!leftMap.has(k)) roleKeys.push(k)

  return roleKeys.map((roleKey) => {
    const ln = leftMap.get(roleKey)
    const rn = rightMap.get(roleKey)
    const left = ln ? sideOf(ln, components, pack) : null
    const right = rn ? sideOf(rn, components, pack) : null

    const specDeltas = specDeltasOf(
      ln ? components.get(ln.componentId) : undefined,
      rn ? components.get(rn.componentId) : undefined,
    )
    const unknownKeys = specDeltas.filter((d) => d.kind === 'unknown').map((d) => d.key)
    const specChanged = specDeltas.some((d) => d.kind === 'changed')
    const componentChanged = !!ln && !!rn && ln.componentId !== rn.componentId
    const qtyChanged = !!left && !!right && left.total !== right.total

    let kind: DiffKind
    if (!ln) kind = 'added'
    else if (!rn) kind = 'removed'
    else if (qtyChanged) kind = 'qty-changed'
    else if (specChanged || componentChanged) kind = 'spec-changed'
    else kind = 'unchanged'

    const partial = {
      roleKey,
      kind,
      label: right?.label ?? left?.label ?? roleKey,
      left,
      right,
      qtyChanged,
      specChanged,
      componentChanged,
      specDeltas,
      unknownKeys,
    }
    return { ...partial, narrative: null, summary: summaryOf(partial) }
  })
}

/** 应用 `ComparisonDefinition` 的人工叙述覆盖，得到可直接渲染的比较结果。 */
export function buildComparison(
  def: ComparisonDefinition,
  pack: FactoryContentPack = FACTORY_PACK,
): ComparisonResult {
  const leftSystem = pack.systems.find((s) => s.id === def.leftSystemId)
  const rightSystem = pack.systems.find((s) => s.id === def.rightSystemId)
  const overrides = new Map(def.rows.map((r) => [r.roleKey, r]))

  const rows = diffSystems(def.leftSystemId, def.rightSystemId, pack).map((row) => {
    const o = overrides.get(row.roleKey)
    return o ? { ...row, label: o.label || row.label, narrative: o.narrative } : row
  })

  const counts = DIFF_ORDER.reduce(
    (acc, k) => {
      acc[k] = rows.filter((r) => r.kind === k).length
      return acc
    },
    {} as Record<DiffKind, number>,
  )

  return {
    id: def.id,
    title: def.title,
    leftSystemId: def.leftSystemId,
    rightSystemId: def.rightSystemId,
    leftName: leftSystem?.name ?? def.leftSystemId,
    rightName: rightSystem?.name ?? def.rightSystemId,
    leftStatus: leftSystem?.status ?? 'shipping',
    rightStatus: rightSystem?.status ?? 'shipping',
    summary: def.summary,
    rows,
    counts,
  }
}

/** 找一对系统之间的比较定义（方向不敏感：反向也能命中，UI 侧再决定左右）。 */
export function comparisonFor(
  leftSystemId: string,
  rightSystemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): ComparisonDefinition | undefined {
  return (
    pack.comparisons.find(
      (c) => c.leftSystemId === leftSystemId && c.rightSystemId === rightSystemId,
    ) ??
    pack.comparisons.find((c) => c.leftSystemId === rightSystemId && c.rightSystemId === leftSystemId)
  )
}

/**
 * 任意两个系统的比较结果——没有**同方向**的人工定义时，退化为纯自动 diff。
 *
 * ⚠️ 反向（用户把左右调过来看）时刻意**不复用**那条定义的 summary 与 narrative：
 * 那些文案是按「A → B」写的，倒过来读会把「新增」讲成「取消」。宁可没有叙述，
 * 也不能给出方向反了的叙述。
 */
export function compareSystems(
  leftSystemId: string,
  rightSystemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): ComparisonResult {
  const def = comparisonFor(leftSystemId, rightSystemId, pack)
  if (def && def.leftSystemId === leftSystemId) return buildComparison(def, pack)
  const leftSystem = pack.systems.find((s) => s.id === leftSystemId)
  const rightSystem = pack.systems.find((s) => s.id === rightSystemId)
  const synthetic: ComparisonDefinition = {
    id: 'cmpdef.auto',
    leftSystemId,
    rightSystemId,
    title: `${leftSystem?.name ?? leftSystemId} → ${rightSystem?.name ?? rightSystemId}`,
    summary: [],
    rows: [],
    sourceIds: [],
  }
  return buildComparison(synthetic, pack)
}

/** assemblyId → diff 类别。3D 侧按它给两个视口的部件描边上色。 */
export function diffIndexOf(result: ComparisonResult): {
  left: Map<string, DiffKind>
  right: Map<string, DiffKind>
} {
  const left = new Map<string, DiffKind>()
  const right = new Map<string, DiffKind>()
  for (const row of result.rows) {
    if (row.left) left.set(row.left.assemblyId, row.kind)
    if (row.right) right.set(row.right.assemblyId, row.kind)
  }
  return { left, right }
}

/** 只保留有变化的行（`showDiffOnly`）。 */
export function changedRows(rows: DiffRow[]): DiffRow[] {
  return rows.filter((r) => r.kind !== 'unchanged')
}

/**
 * 把左侧的焦点按 **roleKey** 换算成右侧系统的等价 focusPath。
 *
 * 比较视图的两个视口靠它保持「看的是同一层东西」：左边在看计算托盘，右边也自动
 * 在看它的计算托盘。右侧没有同名 roleKey（例如左边在看 GB300 的本地缓存盘，
 * 而 Vera Rubin 没建模这一层）时退回右侧的树根，绝不把左侧的 ID 直接塞给右侧。
 */
export function mirrorFocusPath(
  leftFocusId: string | undefined,
  rightSystemId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): string[] {
  const byId = new Map(pack.assemblies.map((a) => [a.id, a]))
  const root = pack.assemblies.find((a) => a.systemId === rightSystemId && a.parentId === null)
  const fallback = root ? [root.id] : []
  if (!leftFocusId) return fallback
  const leftNode = byId.get(leftFocusId)
  if (!leftNode) return fallback
  const mirrored = assembliesByRoleKey(rightSystemId, pack).get(leftNode.roleKey)
  if (!mirrored) return fallback

  const chain: string[] = []
  const seen = new Set<string>()
  let cur: AssemblyNode | undefined = mirrored
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    chain.unshift(cur.id)
    cur = cur.parentId === null ? undefined : byId.get(cur.parentId)
  }
  return chain
}
