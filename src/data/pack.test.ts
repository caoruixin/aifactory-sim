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

  it('★ 非官方源（analyst_report / earnings_call）同样不得进入 countClaim 与组件 specs', () => {
    // 比上一条更严：SemiAnalysis 之类的分析师源即使不在 BROKER 名单里也一样禁止
    const nonOfficial = new Set(
      pack.sources.filter((s) => s.kind === 'analyst_report' || s.kind === 'earnings_call').map((s) => s.id),
    )
    for (const a of pack.assemblies) {
      if (a.countClaim) expect(nonOfficial.has(a.countClaim.sourceId), `${a.id}.countClaim`).toBe(false)
    }
    for (const c of pack.components) {
      for (const [k, claim] of Object.entries(c.specs)) {
        expect(nonOfficial.has(claim.sourceId), `${c.id}.specs.${k}`).toBe(false)
      }
    }
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

describe('批次占位集合', () => {
  it('flows / comparisons 本批为空数组（批次 3 / 4 填充），结构完整可迭代', () => {
    expect(Array.isArray(pack.flows)).toBe(true)
    expect(Array.isArray(pack.comparisons)).toBe(true)
    expect(pack.flows).toEqual([])
    expect(pack.comparisons).toEqual([])
  })
})
