import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import {
  DIFF_ORDER,
  assembliesByRoleKey,
  buildComparison,
  changedRows,
  compareSystems,
  comparisonFor,
  diffIndexOf,
  diffSystems,
  mirrorFocusPath,
  specDeltasOf,
} from './compare'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'
const LPX = 'sys.groq3-lpx'

const componentById = new Map(FACTORY_PACK.components.map((c) => [c.id, c]))

describe('roleKey 配对的确定性', () => {
  it('★ 每个系统内 roleKey → 装配节点是一对一（索引大小 = 节点数）', () => {
    for (const sys of FACTORY_PACK.systems) {
      const nodes = FACTORY_PACK.assemblies.filter((a) => a.systemId === sys.id)
      expect(assembliesByRoleKey(sys.id).size, sys.id).toBe(nodes.length)
    }
  })

  it('★ 每个 (comparison, roleKey) 在两侧各至多命中一个节点 ⇒ diff 行的 roleKey 不重复', () => {
    for (const def of FACTORY_PACK.comparisons) {
      const rows = diffSystems(def.leftSystemId, def.rightSystemId)
      const keys = rows.map((r) => r.roleKey)
      expect(new Set(keys).size, `${def.id} 有重复 roleKey`).toBe(keys.length)
    }
  })

  it('同样的输入产出逐位相同的结果（纯函数，截图基线依赖它）', () => {
    expect(diffSystems(GB300, VERA_RUBIN)).toEqual(diffSystems(GB300, VERA_RUBIN))
  })

  it('行顺序 = 左侧声明顺序在前，右侧独有的追加在后', () => {
    const rows = diffSystems(GB300, VERA_RUBIN)
    const leftKeys = [...assembliesByRoleKey(GB300).keys()]
    expect(rows.slice(0, leftKeys.length).map((r) => r.roleKey)).toEqual(leftKeys)
    for (const r of rows.slice(leftKeys.length)) expect(r.kind).toBe('added')
  })
})

describe('GB300 ↔ Vera Rubin：核心 roleKey 的判定', () => {
  const rows = diffSystems(GB300, VERA_RUBIN)
  const byKey = new Map(rows.map((r) => [r.roleKey, r]))

  it('★ 核心 roleKey 要么配上、要么在比较定义里有显式 narrative 说明', () => {
    const def = comparisonFor(GB300, VERA_RUBIN)!
    const overrides = new Set(def.rows.map((r) => r.roleKey))
    for (const key of ['accelerator', 'host-cpu', 'nvswitch-tray', 'nvswitch-asic', 'scaleout-nic', 'north-south-dpu']) {
      const row = byKey.get(key)
      expect(row, `缺少 roleKey ${key}`).toBeDefined()
      const paired = row!.left !== null && row!.right !== null
      expect(paired || overrides.has(key), `${key} 既没配上也没有 narrative 说明`).toBe(true)
    }
  })

  it('数量变化：交换芯片 18 → 36、网卡 72 → 144（每机架口径）', () => {
    const asic = byKey.get('nvswitch-asic')!
    expect(asic.kind).toBe('qty-changed')
    expect(asic.left!.total).toBe(18)
    expect(asic.right!.total).toBe(36)

    const nic = byKey.get('scaleout-nic')!
    expect(nic.kind).toBe('qty-changed')
    expect(nic.left!.total).toBe(72)
    expect(nic.right!.total).toBe(144)
    expect(nic.componentChanged).toBe(true)
  })

  it('结构不变的部分确实判为无变化：托盘 18、GPU 72、CPU 36', () => {
    expect(byKey.get('compute-tray')!.left!.total).toBe(18)
    expect(byKey.get('compute-tray')!.right!.total).toBe(18)
    expect(byKey.get('compute-tray')!.qtyChanged).toBe(false)
    expect(byKey.get('accelerator')!.left!.total).toBe(72)
    expect(byKey.get('accelerator')!.right!.total).toBe(72)
    expect(byKey.get('host-cpu')!.right!.total).toBe(36)
  })

  it('规格变化：GPU 的 NVLink 带宽 1800 → 3600 被识别为 changed', () => {
    const gpu = byKey.get('accelerator')!
    expect(gpu.kind).toBe('spec-changed')
    const nvlink = gpu.specDeltas.find((d) => d.key === 'nvlinkPerGpuGBs')!
    expect(nvlink.kind).toBe('changed')
    expect(nvlink.left!.value).toBe(1800)
    expect(nvlink.right!.value).toBe(3600)
  })

  it('★ 未公布的值不产生伪 spec-changed：两代 GPU 的 TDP 都是 null ⇒ unknown', () => {
    const gpu = byKey.get('accelerator')!
    const tdp = gpu.specDeltas.find((d) => d.key === 'tdpW')!
    expect(tdp.left!.value).toBeNull()
    expect(tdp.right!.value).toBeNull()
    expect(tdp.kind).toBe('unknown')
    expect(gpu.unknownKeys).toContain('tdpW')
  })

  it('★ 一侧未公布也算 unknown 而不是 changed：GPU 的 NVLink 链路条数（GB300 有 18，Vera Rubin 未公布）', () => {
    const gpu = byKey.get('accelerator')!
    const links = gpu.specDeltas.find((d) => d.key === 'nvlinkLinksPerGpu')!
    expect(links.left!.value).toBe(18)
    expect(links.right!.value).toBeNull()
    expect(links.kind).toBe('unknown')
    expect(gpu.unknownKeys).toContain('nvlinkLinksPerGpu')
  })

  it('★ 供电层：Vera Rubin 规格全未公布 ⇒ 没有一条 changed（全是 unknown）', () => {
    const power = byKey.get('power-shelf')!
    expect(power.specDeltas.filter((d) => d.kind === 'changed')).toEqual([])
    expect(power.unknownKeys.length).toBeGreaterThanOrEqual(4)
    // 组件本身换了（不同的电源层定义），所以整行仍标为规格变化而不是「无变化」
    expect(power.componentChanged).toBe(true)
  })

  it('内容包没收录的层判为 removed，且比较定义里必须有 narrative 澄清「未收录 ≠ 没有」', () => {
    const def = comparisonFor(GB300, VERA_RUBIN)!
    const overrides = new Map(def.rows.map((r) => [r.roleKey, r]))
    const removed = rows.filter((r) => r.kind === 'removed')
    expect(removed.length).toBeGreaterThan(0)
    for (const r of removed) {
      const o = overrides.get(r.roleKey)
      expect(o, `${r.roleKey} 是 removed 却没有 narrative`).toBeDefined()
      expect(o!.narrative).toContain('未收录')
    }
    expect(removed.map((r) => r.roleKey)).toContain('os-storage')
  })
})

describe('Vera Rubin ↔ Rubin Ultra：新增层与预测口径', () => {
  const rows = diffSystems(VERA_RUBIN, NVL576)
  const byKey = new Map(rows.map((r) => [r.roleKey, r]))

  it('光互连是本代新增的 roleKey（左侧没有 ⇒ added）', () => {
    const optics = byKey.get('scaleup-optics')!
    expect(optics.kind).toBe('added')
    expect(optics.left).toBeNull()
    expect(optics.right!.status).toBe('forecast')
  })

  it('交换托架数量 9 → 18（每机架）', () => {
    const tray = byKey.get('nvswitch-tray')!
    expect(tray.left!.total).toBe(9)
    expect(tray.right!.total).toBe(18)
    expect(tray.kind).toBe('qty-changed')
  })

  it('机架数口径：两代都是 8，但含义不同（右侧 8 架 = 一个 NVLink 域）', () => {
    const rack = byKey.get('rack')!
    expect(rack.left!.total).toBe(8)
    expect(rack.right!.total).toBe(8)
    expect(rack.right!.note).toContain('72 张')
  })

  it('CPU 复用了 Vera（官方组件）⇒ 判为无变化', () => {
    const cpu = byKey.get('host-cpu')!
    expect(cpu.componentChanged).toBe(false)
    expect(cpu.kind).toBe('unchanged')
  })
})

describe('GB300 ↔ Rubin Ultra：跨两代', () => {
  const result = compareSystems(GB300, NVL576)

  it('用到了内容包里的比较定义（标题与要点来自 comparisons.ts）', () => {
    expect(result.id).toBe('cmpdef.gb300-to-rubin-ultra')
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.leftStatus).toBe('shipping')
    // v1.3：NVL576 系统本身官宣为 announced（拓扑官方已确认），产能仍靠 capacityPolicy
    // = analyst-modeled 拒绝出数——不能再用 status 判断「这一代是不是可信」。
    expect(result.rightStatus).toBe('announced')
  })

  it('电源架：8 × 33 kW → 4 × 110 kW 被识别为数量 + 规格双变化', () => {
    const row = result.rows.find((r) => r.roleKey === 'power-shelf')!
    expect(row.left!.total).toBe(8)
    expect(row.right!.total).toBe(4)
    expect(row.qtyChanged).toBe(true)
    expect(row.specDeltas.find((d) => d.key === 'shelfPowerKW')!.kind).toBe('changed')
  })

  it('counts 覆盖全部行且类别齐全', () => {
    const total = DIFF_ORDER.reduce((sum, k) => sum + result.counts[k], 0)
    expect(total).toBe(result.rows.length)
    expect(result.counts.added).toBeGreaterThan(0)
    expect(result.counts['qty-changed']).toBeGreaterThan(0)
  })
})

describe('Vera Rubin ↔ Groq 3 LPX：配对（不是换代）', () => {
  const result = compareSystems(VERA_RUBIN, LPX)
  const byKey = new Map(result.rows.map((r) => [r.roleKey, r]))

  it('用到了内容包里的配对定义，且 summary 讲清「不是谁取代谁」', () => {
    expect(result.id).toBe('cmpdef.vera-rubin-to-groq3-lpx')
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.summary.join(' ')).toContain('配对')
    expect(result.summary.join(' ')).toContain('AFD')
    expect(result.rightStatus).toBe('announced')
  })

  it('★ accelerator 行配上了，但两侧是不同类别的加速器（GPU vs LPU）', () => {
    const acc = byKey.get('accelerator')!
    expect(acc.left).not.toBeNull()
    expect(acc.right).not.toBeNull()
    expect(acc.left!.total).toBe(72) // 每机架 72 张 Rubin GPU
    expect(acc.right!.total).toBe(256) // 每机架 256 颗 LP30
    expect(acc.componentChanged).toBe(true)
    // narrative 必须显式警告「72 → 256」这个数字没有可比性
    expect(acc.narrative).toContain('没有可比性')
  })

  it('★ LPX 独有层判为 added：lpu-tray / fabric-expansion / afd-peer-rack', () => {
    for (const key of ['lpu-tray', 'fabric-expansion', 'afd-peer-rack']) {
      const row = byKey.get(key)
      expect(row, `缺少 roleKey ${key}`).toBeDefined()
      expect(row!.kind, key).toBe('added')
      expect(row!.left).toBeNull()
    }
    expect(byKey.get('lpu-tray')!.right!.total).toBe(32)
  })

  it('★ 交换层在 LPX 侧判为 removed，且 narrative 说明这是「真的没有」而不是资料缺失', () => {
    for (const key of ['nvswitch-tray', 'nvswitch-asic', 'gpu-hbm']) {
      const row = byKey.get(key)!
      expect(row.kind, key).toBe('removed')
      expect(row.narrative, `${key} 缺少 narrative`).not.toBeNull()
      expect(row.narrative!, key).toContain('真的没有')
    }
  })

  it('★ scale-out 网卡的 removed 是资料缺口，narrative 必须澄清「未收录 ≠ 没有」', () => {
    const nic = byKey.get('scaleout-nic')!
    expect(nic.kind).toBe('removed')
    expect(nic.narrative).toContain('未收录')
  })

  it('BlueField-4 两边复用同一组件 ⇒ 判为无变化（唯一完全相同的关键部件）', () => {
    const dpu = byKey.get('north-south-dpu')!
    expect(dpu.componentChanged).toBe(false)
    expect(dpu.left!.componentId).toBe('cmp.rubin.bluefield-4')
    expect(dpu.right!.componentId).toBe('cmp.rubin.bluefield-4')
  })

  it('nvlink-backplane 行把「交换式 → 无交换直连」讲出来（跨代语义键复用的价值）', () => {
    const bp = byKey.get('nvlink-backplane')!
    expect(bp.left!.componentId).toBe('cmp.rubin.nvlink-midplane')
    expect(bp.right!.componentId).toBe('cmp.lpx.c2c-spine')
    expect(bp.narrative).toContain('直连')
  })

  it('★ 每条 removed 行都有 narrative（配对表最容易被误读成「LPX 少了一堆东西」）', () => {
    const def = comparisonFor(VERA_RUBIN, LPX)!
    const overrides = new Map(def.rows.map((r) => [r.roleKey, r]))
    for (const r of result.rows.filter((x) => x.kind === 'removed')) {
      expect(overrides.get(r.roleKey), `${r.roleKey} 是 removed 却没有 narrative`).toBeDefined()
    }
  })
})

describe('比较定义与 3D 索引', () => {
  // v1.3 W3：第四条定义是 Vera Rubin ↔ Groq 3 LPX——**配对**关系而不是换代关系。
  it('内容包里四组比较定义都能构建出结果，且 narrative 覆盖生效', () => {
    expect(FACTORY_PACK.comparisons.length).toBe(4)
    for (const def of FACTORY_PACK.comparisons) {
      const result = buildComparison(def)
      expect(result.rows.length).toBeGreaterThan(0)
      for (const o of def.rows) {
        const row = result.rows.find((r) => r.roleKey === o.roleKey)
        expect(row, `${def.id} 的 ${o.roleKey} 没出现在 diff 里`).toBeDefined()
        expect(row!.narrative).toBe(o.narrative)
        expect(row!.label).toBe(o.label)
      }
    }
  })

  it('comparisonFor 对反向查询也能命中', () => {
    expect(comparisonFor(GB300, VERA_RUBIN)!.id).toBe('cmpdef.gb300-to-vera-rubin')
    expect(comparisonFor(VERA_RUBIN, GB300)!.id).toBe('cmpdef.gb300-to-vera-rubin')
  })

  it('没有人工定义的组合退化为纯自动 diff（不编叙述）', () => {
    const result = compareSystems(NVL576, GB300) // 反向：定义方向不匹配
    expect(result.summary).toEqual([])
    expect(result.rows.every((r) => r.narrative === null)).toBe(true)
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it('diffIndexOf 给出的 assemblyId → 类别在两侧都可查，且与行数一致', () => {
    const result = compareSystems(GB300, VERA_RUBIN)
    const idx = diffIndexOf(result)
    expect(idx.left.size).toBe(result.rows.filter((r) => r.left).length)
    expect(idx.right.size).toBe(result.rows.filter((r) => r.right).length)
    expect(idx.left.get('asm.gb300.nvswitch-asic')).toBe('qty-changed')
    expect(idx.right.get('asm.rubin.nvswitch-asic')).toBe('qty-changed')
  })

  it('changedRows 滤掉无变化行（showDiffOnly 用）', () => {
    const rows = diffSystems(GB300, VERA_RUBIN)
    const changed = changedRows(rows)
    expect(changed.length).toBeLessThan(rows.length)
    expect(changed.every((r) => r.kind !== 'unchanged')).toBe(true)
  })
})

describe('mirrorFocusPath：把左侧焦点按 roleKey 映到右侧', () => {
  it('同名 roleKey → 右侧对应节点的完整路径', () => {
    expect(mirrorFocusPath('asm.gb300.compute-tray', VERA_RUBIN)).toEqual([
      'asm.rubin.facility',
      'asm.rubin.row',
      'asm.rubin.rack',
      'asm.rubin.compute-tray',
    ])
    expect(mirrorFocusPath('asm.gb300.b300-gpu', VERA_RUBIN).at(-1)).toBe('asm.rubin.rubin-gpu')
  })

  it('右侧没有该 roleKey（左侧独有的层）→ 退回右侧树根，绝不把左侧 ID 塞过去', () => {
    const path = mirrorFocusPath('asm.gb300.cache-nvme', VERA_RUBIN)
    expect(path).toEqual(['asm.rubin.facility'])
  })

  it('未知 / 空焦点 → 右侧树根', () => {
    expect(mirrorFocusPath(undefined, NVL576)).toEqual(['asm.ru.facility'])
    expect(mirrorFocusPath('asm.nope', NVL576)).toEqual(['asm.ru.facility'])
  })

  it('映射结果始终属于右侧系统', () => {
    const byId = new Map(FACTORY_PACK.assemblies.map((a) => [a.id, a]))
    for (const node of FACTORY_PACK.assemblies.filter((a) => a.systemId === GB300)) {
      for (const id of mirrorFocusPath(node.id, NVL576)) {
        expect(byId.get(id)!.systemId, `${node.id} → ${id}`).toBe(NVL576)
      }
    }
  })
})

describe('specDeltasOf 边界', () => {
  it('只比较两边都登记了的键（键名不同视为无法比较，不制造噪音）', () => {
    const left = componentById.get('cmp.gb300.b300-gpu')!
    const right = componentById.get('cmp.rubin.rubin-gpu')!
    const keys = specDeltasOf(left, right).map((d) => d.key)
    for (const k of keys) {
      expect(k in left.specs).toBe(true)
      expect(k in right.specs).toBe(true)
    }
    // GB300 独有的键不出现
    expect(keys).not.toContain('fp4DenseTflops')
  })

  it('缺任一侧组件时返回空数组（added / removed 行不需要规格对照）', () => {
    expect(specDeltasOf(undefined, componentById.get('cmp.rubin.rubin-gpu'))).toEqual([])
    expect(specDeltasOf(componentById.get('cmp.gb300.b300-gpu'), undefined)).toEqual([])
  })

  it('同值判为 same（数值按容差比较，不受浮点影响）', () => {
    const deltas = specDeltasOf(
      componentById.get('cmp.gb300.connectx-8'),
      componentById.get('cmp.rubin.connectx-9'),
    )
    expect(deltas.find((d) => d.key === 'bandwidthGbs')!.kind).toBe('same') // 两代单口都是 800 Gb/s
    expect(deltas.find((d) => d.key === 'gpuToNicRatio')!.kind).toBe('changed') // 1:1 → 1:2
  })
})
