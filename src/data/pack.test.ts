import { describe, expect, it } from 'vitest'
import { FACTORY_PACK, ancestorsOf, childrenOf } from './index'
import { BROKER_SOURCE_IDS, OFFICIAL_SOURCE_KINDS } from './sources'
import { ID_PREFIX } from './types'
import type { Claim, HardwareComponent, SourceRef } from './types'

const pack = FACTORY_PACK

const ASOF_RE = /^\d{4}-(0[1-9]|1[0-2])$/
/** ID 尾段：小写字母、数字、连字符与点（点用于层级，如 asm.gb300.b300-gpu）。 */
const ID_TAIL_RE = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/

const EVIDENCE_TYPES = new Set([
  'verified_spec',
  'vendor_claim',
  'benchmark',
  'management_guidance',
  'analyst_estimate',
  'forecast',
  'author_opinion',
])
const STATUSES = new Set(['shipping', 'announced', 'forecast'])
const CAPACITY_POLICIES = new Set(['standard', 'analyst-modeled', 'paired-only'])
const PLANES = new Set(['nvlink', 'scaleout', 'business', 'mgmt', 'power', 'cooling'])

const sourceById = new Map(pack.sources.map((s) => [s.id, s]))
const componentIds = new Set(pack.components.map((c) => c.id))
const assemblyById = new Map(pack.assemblies.map((a) => [a.id, a]))
const systemIds = new Set(pack.systems.map((s) => s.id))

/** 遍历包里所有 Claim，附带一个可读的定位串便于失败时排查。 */
function allClaims(): { where: string; claim: Claim }[] {
  const out: { where: string; claim: Claim }[] = []
  for (const s of pack.systems) {
    for (const [k, c] of Object.entries(s.keySpecs)) out.push({ where: `system ${s.id}.keySpecs.${k}`, claim: c })
  }
  for (const c of pack.components) {
    for (const [k, v] of Object.entries(c.specs)) out.push({ where: `component ${c.id}.specs.${k}`, claim: v })
  }
  for (const a of pack.assemblies) {
    if (a.countClaim) out.push({ where: `assembly ${a.id}.countClaim`, claim: a.countClaim })
  }
  for (const c of pack.connections) {
    if (c.bandwidth) out.push({ where: `connection ${c.id}.bandwidth`, claim: c.bandwidth })
  }
  return out
}

/**
 * 组件 → 使用它的全部系统 ID（通过装配树反查；一个共享组件可能被多个系统引用）。
 * v1.3 起「非官方源只能用在非 shipping 系统」这条规则要按这个反查结果判断，
 * 而不是看 Claim 所在文件属于哪一个系统——组件本身可能被复用（如 NVL576 复用
 * Vera Rubin 官方口径的 Vera CPU 组件）。
 */
const systemsUsingComponent = new Map<string, Set<string>>()
for (const a of pack.assemblies) {
  const set = systemsUsingComponent.get(a.componentId) ?? new Set<string>()
  set.add(a.systemId)
  systemsUsingComponent.set(a.componentId, set)
}

/**
 * 通用遍历：每条 Claim 附带「所属系统集合」（v1.3 起替代「Claim 所在文件的系统」这种
 * 隐式假设）——
 *   - system.keySpecs：就是该系统自己；
 *   - component.specs：反查装配树里引用这个组件的全部系统（可能不止一个）；
 *   - assembly.countClaim / connection.bandwidth：装配节点/连接自身的 systemId。
 */
function claimsWithSystems(): { where: string; claim: Claim; systemIds: string[] }[] {
  const out: { where: string; claim: Claim; systemIds: string[] }[] = []
  for (const s of pack.systems) {
    for (const [k, c] of Object.entries(s.keySpecs)) {
      out.push({ where: `system ${s.id}.keySpecs.${k}`, claim: c, systemIds: [s.id] })
    }
  }
  for (const c of pack.components) {
    const users = [...(systemsUsingComponent.get(c.id) ?? new Set<string>())]
    for (const [k, v] of Object.entries(c.specs)) {
      out.push({ where: `component ${c.id}.specs.${k}`, claim: v, systemIds: users })
    }
  }
  for (const a of pack.assemblies) {
    if (a.countClaim) out.push({ where: `assembly ${a.id}.countClaim`, claim: a.countClaim, systemIds: [a.systemId] })
  }
  for (const c of pack.connections) {
    if (c.bandwidth) out.push({ where: `connection ${c.id}.bandwidth`, claim: c.bandwidth, systemIds: [c.systemId] })
  }
  return out
}

describe('ID 唯一性与命名规范', () => {
  const collections: [keyof typeof ID_PREFIX, { id: string }[]][] = [
    ['sources', pack.sources],
    ['systems', pack.systems],
    ['components', pack.components],
    ['assemblies', pack.assemblies],
    ['connections', pack.connections],
    ['flows', pack.flows],
    ['comparisons', pack.comparisons],
    ['scenes', pack.scenes],
  ]

  it('全集合 ID 全局唯一（跨集合也不重复）', () => {
    const all = collections.flatMap(([, rows]) => rows.map((r) => r.id))
    const dupes = all.filter((id, i) => all.indexOf(id) !== i)
    expect(dupes).toEqual([])
    expect(new Set(all).size).toBe(all.length)
  })

  it.each(collections)('%s 集合的 ID 带正确前缀且尾段合法', (key, rows) => {
    const prefix = ID_PREFIX[key]
    for (const row of rows) {
      expect(row.id.startsWith(prefix), `${row.id} 应以 ${prefix} 开头`).toBe(true)
      expect(ID_TAIL_RE.test(row.id.slice(prefix.length)), `${row.id} 尾段不合规`).toBe(true)
    }
  })

  it('模型 ID 唯一（模型不走 ID 前缀规范，沿用上游模型名）', () => {
    const ids = pack.models.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('JSON 可序列化', () => {
  it('JSON 往返后与原对象深等（无函数/Date/undefined 泄漏）', () => {
    const round = JSON.parse(JSON.stringify(pack))
    expect(round).toEqual(pack)
  })

  it('包内不含 undefined 值（会在 JSON 往返中被静默吞掉）', () => {
    const bad: string[] = []
    const walk = (node: unknown, path: string) => {
      if (node === undefined) {
        bad.push(path)
        return
      }
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`))
        return
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, `${path}.${k}`)
    }
    walk(pack, 'pack')
    expect(bad).toEqual([])
  })
})

describe('装配树结构不变量', () => {
  it('每个系统恰好一个根节点', () => {
    for (const sys of pack.systems) {
      const roots = pack.assemblies.filter((a) => a.systemId === sys.id && a.parentId === null)
      expect(roots.length, `${sys.id} 的根节点数`).toBe(1)
    }
  })

  it('parentId 与 componentId 引用都存在，且父子同系统', () => {
    for (const a of pack.assemblies) {
      expect(systemIds.has(a.systemId), `${a.id} 的 systemId 不存在`).toBe(true)
      expect(componentIds.has(a.componentId), `${a.id} 引用了不存在的组件 ${a.componentId}`).toBe(true)
      if (a.parentId !== null) {
        const parent = assemblyById.get(a.parentId)
        expect(parent, `${a.id} 的父节点 ${a.parentId} 不存在`).toBeDefined()
        expect(parent!.systemId, `${a.id} 与其父节点不同系统`).toBe(a.systemId)
      }
    }
  })

  it('装配树无环，且所有节点都能回溯到根', () => {
    for (const a of pack.assemblies) {
      const path = ancestorsOf(a.id)
      // ancestorsOf 遇环会提前停止，因此「路径首元素是根」即可同时证明无环与连通
      expect(path.length, `${a.id} 的祖先路径为空`).toBeGreaterThan(0)
      expect(path[0]!.parentId, `${a.id} 无法回溯到根（可能存在环）`).toBeNull()
      expect(path[path.length - 1]!.id).toBe(a.id)
      expect(new Set(path.map((p) => p.id)).size, `${a.id} 的祖先路径有重复节点`).toBe(path.length)
    }
  })

  it('count 均为正整数', () => {
    for (const a of pack.assemblies) {
      expect(Number.isInteger(a.count), `${a.id}.count 非整数`).toBe(true)
      expect(a.count, `${a.id}.count 应 > 0`).toBeGreaterThan(0)
    }
  })

  it('countClaim 的 value 与 count 一致（证据不能和数据打架）', () => {
    for (const a of pack.assemblies) {
      if (a.countClaim?.value != null) {
        expect(a.countClaim.value, `${a.id} 的 countClaim 与 count 不一致`).toBe(a.count)
      }
    }
  })

  it('声明了 rack-U 的兄弟节点互不重叠，且不超过机架高度', () => {
    const byParent = new Map<string, typeof pack.assemblies>()
    for (const a of pack.assemblies) {
      if (a.rackU === null || a.parentId === null) continue
      const list = byParent.get(a.parentId) ?? []
      list.push(a)
      byParent.set(a.parentId, list)
    }

    for (const [parentId, siblings] of byParent) {
      const system = pack.systems.find((s) => s.id === siblings[0]!.systemId)!
      const rackHeight = system.rackUnitsForLayout
      expect(rackHeight, `${system.id} 声明了 rack-U 却没有 rackUnitsForLayout`).not.toBeNull()

      const sorted = [...siblings].sort((x, y) => x.rackU!.start - y.rackU!.start)
      let prevEnd = 0
      for (const node of sorted) {
        const { start, height } = node.rackU!
        expect(start, `${node.id} 的起始 U 应 ≥ 1`).toBeGreaterThanOrEqual(1)
        expect(height, `${node.id} 的 U 高应 > 0`).toBeGreaterThan(0)
        expect(start, `${node.id} 与前一个兄弟节点（父 ${parentId}）U 位重叠`).toBeGreaterThan(prevEnd)
        prevEnd = start + height - 1
        expect(prevEnd, `${node.id} 超出机架高度 ${rackHeight}U`).toBeLessThanOrEqual(rackHeight!)
      }
    }
  })
})

describe('连接不变量', () => {
  it('两端装配节点都存在，且与连接自身同系统', () => {
    for (const c of pack.connections) {
      expect(systemIds.has(c.systemId), `${c.id} 的 systemId 不存在`).toBe(true)
      const from = assemblyById.get(c.fromAssemblyId)
      const to = assemblyById.get(c.toAssemblyId)
      expect(from, `${c.id} 的起点 ${c.fromAssemblyId} 不存在`).toBeDefined()
      expect(to, `${c.id} 的终点 ${c.toAssemblyId} 不存在`).toBeDefined()
      expect(from!.systemId, `${c.id} 的起点跨系统`).toBe(c.systemId)
      expect(to!.systemId, `${c.id} 的终点跨系统`).toBe(c.systemId)
      expect(c.fromAssemblyId, `${c.id} 的两端相同`).not.toBe(c.toAssemblyId)
    }
  })

  it('plane 合法，且同一对端点在同一平面上不重复建边', () => {
    const seen = new Set<string>()
    for (const c of pack.connections) {
      expect(PLANES.has(c.plane), `${c.id} 的 plane 非法：${c.plane}`).toBe(true)
      const key = `${c.systemId}|${c.plane}|${c.fromAssemblyId}|${c.toAssemblyId}`
      expect(seen.has(key), `${c.id} 与已有连接重复（同平面同端点）`).toBe(false)
      seen.add(key)
    }
  })

  it('sourceIds 全部指向已登记的源', () => {
    for (const c of pack.connections) {
      for (const sid of c.sourceIds) {
        expect(sourceById.has(sid), `${c.id} 引用了未登记的源 ${sid}`).toBe(true)
      }
    }
  })
})

describe('证据纪律', () => {
  it('所有源的 asOf 格式为 YYYY-MM', () => {
    for (const s of pack.sources) expect(ASOF_RE.test(s.asOf), `${s.id}.asOf=${s.asOf}`).toBe(true)
  })

  it('每条 Claim 的 sourceId 存在、asOf 合法、evidence/status 取值合法', () => {
    for (const { where, claim } of allClaims()) {
      expect(sourceById.has(claim.sourceId), `${where} 引用了未登记的源 ${claim.sourceId}`).toBe(true)
      expect(ASOF_RE.test(claim.asOf), `${where}.asOf=${claim.asOf} 不是 YYYY-MM`).toBe(true)
      expect(EVIDENCE_TYPES.has(claim.evidence), `${where}.evidence=${claim.evidence} 非法`).toBe(true)
      expect(STATUSES.has(claim.status), `${where}.status=${claim.status} 非法`).toBe(true)
    }
  })

  it('每个系统的 capacityPolicy 取值合法（v1.3 新增字段）', () => {
    for (const s of pack.systems) {
      expect(CAPACITY_POLICIES.has(s.capacityPolicy), `${s.id}.capacityPolicy=${s.capacityPolicy} 非法`).toBe(true)
    }
  })

  it('★ verified_spec / vendor_claim 只能引用官方源（official_doc / official_press）', () => {
    const officialKinds = new Set<SourceRef['kind']>(OFFICIAL_SOURCE_KINDS)
    for (const { where, claim } of allClaims()) {
      if (claim.evidence !== 'verified_spec' && claim.evidence !== 'vendor_claim') continue
      const src = sourceById.get(claim.sourceId)!
      expect(
        officialKinds.has(src.kind),
        `${where} 用 ${claim.evidence} 引用了非官方源 ${src.id}（kind=${src.kind}）`,
      ).toBe(true)
    }
  })

  it('★ 券商/分析师源不得出现在任何 countClaim 或组件 specs 中', () => {
    const banned = new Set<string>(BROKER_SOURCE_IDS)
    for (const a of pack.assemblies) {
      if (a.countClaim) {
        expect(banned.has(a.countClaim.sourceId), `${a.id}.countClaim 引用了券商源`).toBe(false)
      }
    }
    for (const c of pack.components) {
      for (const [k, claim] of Object.entries(c.specs)) {
        expect(banned.has(claim.sourceId), `${c.id}.specs.${k} 引用了券商源`).toBe(false)
      }
    }
  })

  /**
   * v1.3 重写（原规则要求「非官方源所在系统必须是 forecast 状态」——NVL576 v1.3 起
   * 官宣为 `announced`，但装配树里仍然混着 SemiAnalysis 的分析师 Claim，一刀切的
   * status 检查会把这些完全合规的 Claim 也判违规）。
   *
   * 新规则改为**通用遍历反查 Claim 所属系统集合**（`claimsWithSystems`），
   * 对每一条引用了非官方源（`analyst_report` / `earnings_call` / `media_report`）
   * 的 Claim 强制三件事：
   *   1. `evidence ∈ {analyst_estimate, forecast}`——不能靠非官方源冒充 verified_spec/vendor_claim
   *      （那条规则在上面单独锁）；
   *   2. `claim.status === 'forecast'`——Claim 自身的状态，不是它所在系统的状态；
   *   3. 引用了它的**全部**系统都不是 `shipping`——已经量产的一代不该在装配树/规格里
   *      掺分析师或媒体数字（哪怕只是被复用组件间接带进来）。
   */
  it('★ 非官方源（分析师/业绩会/媒体报道）Claim：证据+状态受限，且不出现在任何 shipping 系统', () => {
    const nonOfficial = new Set(
      pack.sources
        .filter((s) => s.kind === 'analyst_report' || s.kind === 'earnings_call' || s.kind === 'media_report')
        .map((s) => s.id),
    )
    const allowedEvidence = new Set(['analyst_estimate', 'forecast'])
    const systemStatus = new Map(pack.systems.map((s) => [s.id, s.status]))
    let checked = 0
    for (const { where, claim, systemIds: users } of claimsWithSystems()) {
      if (!nonOfficial.has(claim.sourceId)) continue
      checked += 1
      expect(allowedEvidence.has(claim.evidence), `${where} 用非官方源却标了 ${claim.evidence}`).toBe(true)
      expect(claim.status, `${where} 用非官方源却不是 forecast 状态`).toBe('forecast')
      for (const sysId of users) {
        expect(systemStatus.get(sysId), `${where} 被 shipping 系统 ${sysId} 使用`).not.toBe('shipping')
      }
    }
    // 防止规则被静默架空：至少要真的检查到 NVL576 那批 SemiAnalysis Claim。
    expect(checked).toBeGreaterThan(30)
  })

  it('组件与系统的 sourceIds 全部指向已登记的源', () => {
    for (const c of pack.components) {
      for (const sid of c.sourceIds) expect(sourceById.has(sid), `${c.id} → ${sid}`).toBe(true)
    }
    for (const s of pack.systems) {
      for (const sid of s.sourceIds) expect(sourceById.has(sid), `${s.id} → ${sid}`).toBe(true)
    }
  })
})

describe('状态一致性', () => {
  it('shipping 系统的装配树里不出现 forecast 组件', () => {
    const componentById = new Map(pack.components.map((c) => [c.id, c]))
    for (const sys of pack.systems.filter((s) => s.status === 'shipping')) {
      for (const a of pack.assemblies.filter((x) => x.systemId === sys.id)) {
        const comp = componentById.get(a.componentId)!
        expect(comp.status, `${sys.id} 是 shipping，但 ${a.id} 用了 ${comp.status} 组件 ${comp.id}`).not.toBe(
          'forecast',
        )
      }
    }
  })

  it('shipping 系统的 Claim 不应带 forecast 证据', () => {
    for (const sys of pack.systems.filter((s) => s.status === 'shipping')) {
      for (const [k, c] of Object.entries(sys.keySpecs)) {
        expect(c.evidence, `${sys.id}.keySpecs.${k}`).not.toBe('forecast')
        expect(c.status, `${sys.id}.keySpecs.${k}`).not.toBe('forecast')
      }
    }
  })
})

describe('组件不变量', () => {
  it('只有 kind==="gpu" 的组件带 mathSpecs', () => {
    for (const c of pack.components) {
      const hasMath = 'mathSpecs' in c && (c as { mathSpecs?: unknown }).mathSpecs !== undefined
      if (c.kind === 'gpu') {
        expect(hasMath, `${c.id} 是 GPU 却没有 mathSpecs 字段（未公布应显式写 null）`).toBe(true)
      } else {
        expect(hasMath, `${c.id} 不是 GPU 却带了 mathSpecs`).toBe(false)
      }
    }
  })

  it('GPU 的 mathSpecs 若存在，关键数值为正且带 derivation 说明', () => {
    for (const c of pack.components) {
      if (c.kind !== 'gpu') continue
      const m = (c as Extract<HardwareComponent, { kind: 'gpu' }>).mathSpecs
      if (m === null) continue
      expect(m.memoryGB, `${c.id}.mathSpecs.memoryGB`).toBeGreaterThan(0)
      expect(m.bandwidthTBs, `${c.id}.mathSpecs.bandwidthTBs`).toBeGreaterThan(0)
      expect(m.derivation.length, `${c.id}.mathSpecs.derivation 不能为空`).toBeGreaterThan(0)
      for (const key of ['fp8Tflops', 'fp4Tflops', 'tdpW'] as const) {
        const v = m[key]
        if (v !== null) expect(v, `${c.id}.mathSpecs.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('每个组件都有 summary 与 presalesNote（售前话术不留空）', () => {
    for (const c of pack.components) {
      expect(c.summary.trim().length, `${c.id}.summary 为空`).toBeGreaterThan(0)
      expect(c.presalesNote.trim().length, `${c.id}.presalesNote 为空`).toBeGreaterThan(0)
    }
  })

  it('包内没有游离组件（每个组件至少被一个装配节点引用）', () => {
    const used = new Set(pack.assemblies.map((a) => a.componentId))
    const orphans = pack.components.filter((c) => !used.has(c.id)).map((c) => c.id)
    expect(orphans).toEqual([])
  })
})

describe('系统与场景', () => {
  it('系统 keySpecs 至少包含 gpuCount 与 rackPowerKW', () => {
    for (const s of pack.systems) {
      expect(Object.keys(s.keySpecs)).toContain('gpuCount')
      expect(Object.keys(s.keySpecs)).toContain('rackPowerKW')
    }
  })

  it('场景引用的系统、装配节点与平面均存在合法', () => {
    for (const scene of pack.scenes) {
      expect(systemIds.has(scene.systemId), `${scene.id} 的 systemId`).toBe(true)
      if (scene.focusAssemblyId !== null) {
        const node = assemblyById.get(scene.focusAssemblyId)
        expect(node, `${scene.id} 的 focus ${scene.focusAssemblyId} 不存在`).toBeDefined()
        expect(node!.systemId).toBe(scene.systemId)
      }
      for (const id of scene.highlightAssemblyIds) {
        const node = assemblyById.get(id)
        expect(node, `${scene.id} 高亮了不存在的 ${id}`).toBeDefined()
        expect(node!.systemId).toBe(scene.systemId)
      }
      for (const p of scene.planes) expect(PLANES.has(p), `${scene.id} 的平面 ${p}`).toBe(true)
    }
  })

  it('childrenOf 与 parentId 互为逆关系', () => {
    for (const a of pack.assemblies) {
      for (const child of childrenOf(a.id)) expect(child.parentId).toBe(a.id)
    }
  })
})

describe('代际比较定义（B4 填充，替换原「comparisons 为空」占位断言）', () => {
  it('comparisons 非空，且每条的左右系统都存在、不自比', () => {
    expect(Array.isArray(pack.comparisons)).toBe(true)
    expect(pack.comparisons.length).toBeGreaterThan(0)
    for (const c of pack.comparisons) {
      expect(systemIds.has(c.leftSystemId), `${c.id} 的左系统 ${c.leftSystemId}`).toBe(true)
      expect(systemIds.has(c.rightSystemId), `${c.id} 的右系统 ${c.rightSystemId}`).toBe(true)
      expect(c.leftSystemId, `${c.id} 左右系统相同`).not.toBe(c.rightSystemId)
    }
  })

  it('同一对系统只定义一次（方向敏感），且 summary / title 非空', () => {
    const seen = new Set<string>()
    for (const c of pack.comparisons) {
      const key = `${c.leftSystemId}|${c.rightSystemId}`
      expect(seen.has(key), `${c.id} 与已有定义重复`).toBe(false)
      seen.add(key)
      expect(c.title.trim().length, `${c.id}.title`).toBeGreaterThan(0)
      expect(c.summary.length, `${c.id}.summary 至少一条要点`).toBeGreaterThan(0)
      for (const s of c.summary) expect(s.trim().length, `${c.id}.summary 有空要点`).toBeGreaterThan(0)
    }
  })

  it('rows 的 roleKey 在两侧至少一侧存在（不写不存在的 roleKey），narrative 非空', () => {
    const roleKeysOf = (systemId: string) =>
      new Set(pack.assemblies.filter((a) => a.systemId === systemId).map((a) => a.roleKey))
    for (const c of pack.comparisons) {
      const left = roleKeysOf(c.leftSystemId)
      const right = roleKeysOf(c.rightSystemId)
      const seen = new Set<string>()
      for (const row of c.rows) {
        expect(seen.has(row.roleKey), `${c.id} 的 roleKey ${row.roleKey} 重复`).toBe(false)
        seen.add(row.roleKey)
        expect(
          left.has(row.roleKey) || right.has(row.roleKey),
          `${c.id} 的 roleKey ${row.roleKey} 在两侧系统里都不存在`,
        ).toBe(true)
        if (row.narrative !== null) {
          expect(row.narrative.trim().length, `${c.id}.${row.roleKey}.narrative 为空串`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('sourceIds 全部指向已登记的源', () => {
    for (const c of pack.comparisons) {
      for (const sid of c.sourceIds) expect(sourceById.has(sid), `${c.id} → ${sid}`).toBe(true)
    }
  })
})

describe('★ 跨代比较的前提：roleKey 在系统内唯一', () => {
  it('同一系统内不出现重复 roleKey（否则 roleKey 配对不再确定）', () => {
    for (const sys of pack.systems) {
      const seen = new Map<string, string>()
      for (const a of pack.assemblies.filter((x) => x.systemId === sys.id)) {
        const prev = seen.get(a.roleKey)
        expect(prev, `${sys.id} 的 roleKey「${a.roleKey}」被 ${prev} 与 ${a.id} 同时使用`).toBeUndefined()
        seen.set(a.roleKey, a.id)
      }
    }
  })

  it('roleKey 命名规范：小写字母 + 连字符', () => {
    for (const a of pack.assemblies) {
      expect(/^[a-z][a-z0-9-]*$/.test(a.roleKey), `${a.id}.roleKey=${a.roleKey}`).toBe(true)
    }
  })

  /**
   * v1.3 W3 重写（原规则要求**每个**系统都有 `compute-tray` + `nvswitch-tray`——
   * Groq 3 LPX 两个都没有：它的托盘是 `lpu-tray`，而且整个架构里根本不存在交换层）。
   *
   * 新规则**按架构分型**，而不是放宽成「随便有几个就行」：
   *   - 四代共有：facility / rack-row / rack / accelerator / host-cpu
   *     ——机房、机架列、机架、加速器、主机 CPU 是任何一代都必须有的骨架，
   *       少一个跨代比较就会退化成一堆 added/removed；
   *   - NVLink 域三代（capacityPolicy !== 'paired-only'）额外强制 compute-tray + nvswitch-tray
   *     ——「有没有交换托盘」正是这一族的定义特征；
   *   - LPX（paired-only）额外强制它**自己**的核心角色 lpu-tray + fabric-expansion + nvlink-backplane
   *     ——豁免不等于不检查，否则哪天 LPX 的托盘层被删掉也没人发现。
   */
  it('核心 roleKey 按架构分型强制：四代共有骨架 + NVLink 域的交换托盘 + LPX 自有角色', () => {
    const sharedCore = ['facility', 'rack-row', 'rack', 'accelerator', 'host-cpu']
    /** NVLink 交换域架构（GB300 / Vera Rubin / NVL576）的定义特征。 */
    const nvlinkDomainCore = ['compute-tray', 'nvswitch-tray']
    /** LPU 直连架构（Groq 3 LPX）的定义特征：托盘、托盘内扩展逻辑、机架内 scale-up 底板。 */
    const lpuFabricCore = ['lpu-tray', 'fabric-expansion', 'nvlink-backplane']

    for (const sys of pack.systems) {
      const keys = new Set(pack.assemblies.filter((a) => a.systemId === sys.id).map((a) => a.roleKey))
      for (const k of sharedCore) expect(keys.has(k), `${sys.id} 缺少四代共有的核心 roleKey ${k}`).toBe(true)

      if (sys.capacityPolicy === 'paired-only') {
        for (const k of lpuFabricCore) {
          expect(keys.has(k), `${sys.id}（LPU 直连架构）缺少自有核心 roleKey ${k}`).toBe(true)
        }
        // 豁免要「说到做到」：LPX 确实不该有 NVLink 交换托盘，写进来反而是建模错误。
        expect(keys.has('nvswitch-tray'), `${sys.id} 不该有 nvswitch-tray（LPX 架构里没有交换层）`).toBe(false)
      } else {
        for (const k of nvlinkDomainCore) {
          expect(keys.has(k), `${sys.id}（NVLink 域架构）缺少核心 roleKey ${k}`).toBe(true)
        }
      }
    }
  })
})

describe('★ 加速器分型：LPU 分支不得携带 GPU 的 roofline 数学参数（v1.3 W3）', () => {
  it('kind==="lpu" 的组件运行期不带 mathSpecs 键（类型层面已不可能，这里兜底）', () => {
    const lpus = pack.components.filter((c) => c.kind === 'lpu')
    expect(lpus.length, '内容包里应至少有一个 LPU 组件（Groq 3 LP30）').toBeGreaterThan(0)
    for (const c of lpus) {
      expect(
        Object.hasOwn(c, 'mathSpecs'),
        `${c.id} 是 LPU 却带了 mathSpecs——产能 roofline 是按 GPU（HBM 容量/带宽 + 稠密 TFLOPS）建的，套到 SRAM-first 的 LPU 上会得出彻底错误的数字`,
      ).toBe(false)
    }
  })

  it('只有 kind==="gpu" 的组件才允许出现 mathSpecs 键', () => {
    for (const c of pack.components) {
      if (Object.hasOwn(c, 'mathSpecs')) {
        expect(c.kind, `${c.id} 不是 GPU 却带了 mathSpecs`).toBe('gpu')
      }
    }
  })

  it('LPU 组件没有任何 HBM 语义的规格键（SRAM-first 架构，官方明确不带 HBM）', () => {
    for (const c of pack.components.filter((x) => x.kind === 'lpu')) {
      for (const key of Object.keys(c.specs)) {
        expect(
          /^hbm/i.test(key),
          `${c.id}.specs.${key} 用了 HBM 语义的键名——LPU 没有 HBM，工作集在片上 SRAM`,
        ).toBe(false)
      }
    }
  })
})

describe('推理数据流剧本（FlowEpisode）通用不变量', () => {
  const modelIds = new Set(pack.models.map((m) => m.id))
  const connectionIds = new Set(pack.connections.map((c) => c.id))
  const PHASES: (typeof pack.flows)[number]['steps'][number]['phase'][] = [
    'ingress',
    'prefill',
    'kv-write',
    'decode',
    'moe-dispatch',
    'moe-combine',
    'egress',
  ]
  const phaseIndex = new Map(PHASES.map((p, i) => [p, i]))

  it('批次 3 起 flows 非空，结构完整可迭代', () => {
    expect(Array.isArray(pack.flows)).toBe(true)
    expect(pack.flows.length).toBeGreaterThan(0)
  })

  it('systemId 存在，modelId 为 null 或指向已登记模型', () => {
    for (const f of pack.flows) {
      expect(systemIds.has(f.systemId), `${f.id} 的 systemId`).toBe(true)
      if (f.modelId !== null) expect(modelIds.has(f.modelId), `${f.id} 的 modelId ${f.modelId}`).toBe(true)
    }
  })

  it('sourceIds 全部指向已登记的源', () => {
    for (const f of pack.flows) {
      for (const sid of f.sourceIds) expect(sourceById.has(sid), `${f.id} → ${sid}`).toBe(true)
    }
  })

  it('每个 episode 至少有一个步骤，title/summary 非空', () => {
    for (const f of pack.flows) {
      expect(f.steps.length, f.id).toBeGreaterThan(0)
      expect(f.title.trim().length, `${f.id}.title`).toBeGreaterThan(0)
      expect(f.summary.trim().length, `${f.id}.summary`).toBeGreaterThan(0)
    }
  })

  it('★ phase 顺序在 FLOW_PHASE_ORDER 下单调不减', () => {
    for (const f of pack.flows) {
      let prev = -1
      for (const step of f.steps) {
        const idx = phaseIndex.get(step.phase)!
        expect(idx, `${f.id} 的步骤 ${step.id} phase=${step.phase} 非法`).toBeDefined()
        expect(idx, `${f.id} 的步骤 ${step.id} 违反 phase 单调`).toBeGreaterThanOrEqual(prev)
        prev = idx
      }
    }
  })

  it('durationHint 均为正数', () => {
    for (const f of pack.flows) {
      for (const step of f.steps) {
        expect(step.durationHint, `${f.id}.${step.id}.durationHint`).toBeGreaterThan(0)
      }
    }
  })

  it('每个步骤 label/description 非空（narration 不留空）', () => {
    for (const f of pack.flows) {
      for (const step of f.steps) {
        expect(step.label.trim().length, `${f.id}.${step.id}.label`).toBeGreaterThan(0)
        expect(step.description.trim().length, `${f.id}.${step.id}.description`).toBeGreaterThan(0)
      }
    }
  })

  it('★ connectionIds 全部指向内容包中存在的 Connection，且与 episode 同系统', () => {
    const byId = new Map(pack.connections.map((c) => [c.id, c]))
    for (const f of pack.flows) {
      for (const step of f.steps) {
        for (const cid of step.connectionIds) {
          expect(connectionIds.has(cid), `${f.id}.${step.id} 引用了不存在的连接 ${cid}`).toBe(true)
          expect(byId.get(cid)!.systemId, `${f.id}.${step.id} 引用的连接 ${cid} 跨系统`).toBe(f.systemId)
        }
      }
    }
  })

  it('★ highlightAssemblyIds 全部指向内容包中存在的装配节点，且与 episode 同系统', () => {
    for (const f of pack.flows) {
      for (const step of f.steps) {
        for (const aid of step.highlightAssemblyIds) {
          const node = assemblyById.get(aid)
          expect(node, `${f.id}.${step.id} 高亮了不存在的装配节点 ${aid}`).toBeDefined()
          expect(node!.systemId, `${f.id}.${step.id} 高亮的 ${aid} 跨系统`).toBe(f.systemId)
        }
      }
    }
  })

  it('logicalOnly 步骤可以没有 connectionIds/highlightAssemblyIds，但不强制要求为空', () => {
    for (const f of pack.flows) {
      for (const step of f.steps) {
        expect(typeof step.logicalOnly, `${f.id}.${step.id}.logicalOnly`).toBe('boolean')
      }
    }
  })

  it('★ 每个步骤都显式带 particleDirection 字段（hasOwn，不能靠 undefined 蒙混过关）', () => {
    // 用 hasOwn 而不是 `!== undefined`：漏填的字段在 TS 之外（比如 JSON 内容包）
    // 读出来也是 undefined，只有 hasOwn 能把「真的写了」这件事钉死。
    for (const f of pack.flows) {
      for (const step of f.steps) {
        expect(
          Object.hasOwn(step, 'particleDirection'),
          `${f.id}.${step.id} 缺少 particleDirection 字段`,
        ).toBe(true)
      }
    }
  })

  it('★ particleDirection 取值合法，且与「这一步有没有线」自洽', () => {
    const ALLOWED = ['forward', 'reverse', 'bidirectional', null]
    for (const f of pack.flows) {
      for (const step of f.steps) {
        expect(ALLOWED, `${f.id}.${step.id}.particleDirection=${String(step.particleDirection)}`).toContain(
          step.particleDirection,
        )
        // 没有线就没有方向可言：逻辑层步骤与纯本地动作一律 null，
        // 否则「有方向却没有粒子」会在阅读内容包时误导人。
        if (step.logicalOnly || step.connectionIds.length === 0) {
          expect(
            step.particleDirection,
            `${f.id}.${step.id} 没有可播放的连接，particleDirection 应为 null`,
          ).toBeNull()
        }
      }
    }
  })

  it('每个 episode 至少一个 logicalOnly 步骤，且至少覆盖 moe-dispatch 与 moe-combine 阶段', () => {
    for (const f of pack.flows) {
      expect(f.steps.some((s) => s.logicalOnly), `${f.id} 缺少 logicalOnly 步骤`).toBe(true)
      expect(f.steps.some((s) => s.phase === 'moe-dispatch'), `${f.id} 缺少 moe-dispatch 步骤`).toBe(true)
      expect(f.steps.some((s) => s.phase === 'moe-combine'), `${f.id} 缺少 moe-combine 步骤`).toBe(true)
    }
  })

  it('episode 总时长（durationHint 之和，教学节奏）< 60 秒', () => {
    for (const f of pack.flows) {
      const total = f.steps.reduce((sum, s) => sum + s.durationHint, 0)
      expect(total, f.id).toBeLessThan(60)
    }
  })
})
