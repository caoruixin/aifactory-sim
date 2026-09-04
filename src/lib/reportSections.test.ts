import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import {
  REPORT_RELATION_ORDER,
  comparisonRelationOf,
  generationChainSystems,
  pairingComparisons,
  relationOfDefinition,
  reportComparisonGroups,
  shortSystemName,
} from './reportSections'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'
const LPX = 'sys.groq3-lpx'
const HGX = 'sys.hgx-b300'

const sys = (id: string) => FACTORY_PACK.systems.find((s) => s.id === id)

describe('comparisonRelationOf：一对系统之间是什么关系', () => {
  it('★ 同为机架级 NVLink 域 ⇒ 换代（GB300 → Vera Rubin → NVL576）', () => {
    expect(comparisonRelationOf(sys(GB300), sys(VERA_RUBIN))).toBe('generation')
    expect(comparisonRelationOf(sys(VERA_RUBIN), sys(NVL576))).toBe('generation')
    expect(comparisonRelationOf(sys(GB300), sys(NVL576))).toBe('generation')
  })

  it('★ 域架构不同 ⇒ 同代内的域选择（GB300 机架域 ↔ HGX 服务器域），不是换代', () => {
    expect(comparisonRelationOf(sys(GB300), sys(HGX))).toBe('same-era-domain')
    // 方向无关
    expect(comparisonRelationOf(sys(HGX), sys(GB300))).toBe('same-era-domain')
  })

  it('★ 任一侧 paired-only ⇒ 配对（Vera Rubin ↔ Groq 3 LPX），优先级高于域架构判据', () => {
    expect(comparisonRelationOf(sys(VERA_RUBIN), sys(LPX))).toBe('pairing')
    expect(comparisonRelationOf(sys(LPX), sys(VERA_RUBIN))).toBe('pairing')
  })

  it('系统查不到时回落到 generation，不抛错', () => {
    expect(comparisonRelationOf(undefined, sys(GB300))).toBe('generation')
    expect(comparisonRelationOf(sys(GB300), undefined)).toBe('generation')
  })
})

describe('reportComparisonGroups：§04 主体只渲染人工比较定义', () => {
  it('★ 只遍历 FACTORY_PACK.comparisons——绝不再按 systems 声明顺序两两串联', () => {
    const rendered = reportComparisonGroups().flatMap((g) => g.definitions.map((d) => d.id))
    const paired = pairingComparisons().map((d) => d.id)
    // 主体 + §4b 配对段 = 内容包里全部人工定义，一条不多一条不少
    expect([...rendered, ...paired].sort()).toEqual(FACTORY_PACK.comparisons.map((d) => d.id).sort())
    // 每一条都有标题与至少一条汇报要点（这正是「不渲染裸的自动 diff 表」的判据）
    for (const id of rendered) {
      const def = FACTORY_PACK.comparisons.find((d) => d.id === id)!
      expect(def.title.length, id).toBeGreaterThan(0)
      expect(def.summary.length, id).toBeGreaterThan(0)
    }
  })

  it('★ 不会出现 cmpdef.auto：主体渲染的每个 id 都是内容包里真实存在的人工定义', () => {
    const known = new Set(FACTORY_PACK.comparisons.map((d) => d.id))
    for (const g of reportComparisonGroups()) {
      for (const d of g.definitions) {
        expect(d.id).not.toBe('cmpdef.auto')
        expect(known.has(d.id), d.id).toBe(true)
      }
    }
  })

  it('分组顺序固定（换代主线在前），组内保持内容包声明顺序——截图基线依赖这个确定性', () => {
    const groups = reportComparisonGroups()
    expect(groups.map((g) => g.relation)).toEqual(
      REPORT_RELATION_ORDER.filter((r) => groups.some((g) => g.relation === r)),
    )
    for (const g of groups) {
      const declared = FACTORY_PACK.comparisons.filter((d) => g.definitions.includes(d))
      expect(g.definitions).toEqual(declared)
    }
  })

  it('★ HGX B300 与 GB300 的那条定义落在「同代内的域选择」，不在换代主线里', () => {
    const sameEra = reportComparisonGroups().find((g) => g.relation === 'same-era-domain')
    expect(sameEra).toBeDefined()
    const ids = sameEra!.definitions.map((d) => `${d.leftSystemId}|${d.rightSystemId}`)
    expect(ids).toContain(`${GB300}|${HGX}`)
    const generation = reportComparisonGroups().find((g) => g.relation === 'generation')!
    for (const d of generation.definitions) {
      expect([d.leftSystemId, d.rightSystemId], d.id).not.toContain(HGX)
      expect([d.leftSystemId, d.rightSystemId], d.id).not.toContain(LPX)
    }
  })

  it('relationOfDefinition 与 comparisonRelationOf 一致', () => {
    for (const d of FACTORY_PACK.comparisons) {
      expect(relationOfDefinition(d), d.id).toBe(
        comparisonRelationOf(sys(d.leftSystemId), sys(d.rightSystemId)),
      )
    }
  })
})

describe('generationChainSystems：标题里的换代主线', () => {
  it('★ 链上只有 GB300 → Vera Rubin NVL72 → Vera Rubin Ultra NVL576', () => {
    expect(generationChainSystems().map((s) => s.id)).toEqual([GB300, VERA_RUBIN, NVL576])
  })

  it('★ HGX B300 不在链上——它与 GB300 同代同芯片、现在就量产，排进链尾是事实错误', () => {
    const ids = generationChainSystems().map((s) => s.id)
    expect(ids).not.toContain(HGX)
    // 而且 HGX 的 status 就是 shipping，和 GB300 一样（这就是「同代」的直接证据）
    expect(sys(HGX)!.status).toBe('shipping')
    expect(sys(GB300)!.status).toBe('shipping')
  })

  it('★ Groq 3 LPX 也不在链上（配对，不是换代）', () => {
    expect(generationChainSystems().map((s) => s.id)).not.toContain(LPX)
  })

  it('链的顺序 = 内容包 systems 声明顺序', () => {
    const declared = FACTORY_PACK.systems.map((s) => s.id)
    const chain = generationChainSystems().map((s) => s.id)
    const positions = chain.map((id) => declared.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('shortSystemName', () => {
  it('去掉 NVIDIA 前缀与「（预测）」后缀（与顶栏代际按钮同口径）', () => {
    expect(shortSystemName('NVIDIA GB300 NVL72')).toBe('GB300 NVL72')
    expect(shortSystemName('NVIDIA Vera Rubin Ultra NVL576')).toBe('Vera Rubin Ultra NVL576')
    expect(shortSystemName('某系统（预测）')).toBe('某系统')
  })
})
