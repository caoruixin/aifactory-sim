import { describe, expect, it } from 'vitest'
import {
  canDrillInto,
  crumbsOf,
  initialDrillState,
  levelOfFocus,
  nextState,
  rackContainerOf,
  sceneAnchorOf,
  trayContainerOf,
} from './drill'
import type { DrillState } from './drill'

const SYSTEM_ID = 'sys.gb300-nvl72'
const ROOT = 'asm.gb300.facility'
const RACK = 'asm.gb300.rack'
const TRAY = 'asm.gb300.compute-tray'
const GPU = 'asm.gb300.b300-gpu'

describe('levelOfFocus：从装配树结构推导层级（不解析 ID 字符串）', () => {
  it.each([
    [ROOT, 'cluster'],
    ['asm.gb300.row', 'cluster'],
    ['asm.gb300.cdu', 'cluster'],
    ['asm.gb300.mgmt-node', 'cluster'],
    [RACK, 'rack'],
    ['asm.gb300.power-shelf', 'rack'],
    ['asm.gb300.busbar', 'rack'],
    [TRAY, 'tray'],
    ['asm.gb300.nvswitch-tray', 'tray'],
    ['asm.gb300.tray-cold-plate', 'tray'],
    [GPU, 'board'],
    ['asm.gb300.grace-cpu', 'board'],
    ['asm.gb300.hbm', 'board'],
    ['asm.gb300.nvswitch-asic', 'board'],
  ])('%s → %s', (id, level) => {
    expect(levelOfFocus(id)).toBe(level)
  })

  it('未知 ID 退回 cluster 而不是抛异常', () => {
    expect(levelOfFocus('asm.nope')).toBe('cluster')
  })
})

describe('canDrillInto', () => {
  it('机架与托盘可以继续下钻', () => {
    expect(canDrillInto(RACK)).toBe(true)
    expect(canDrillInto(TRAY)).toBe(true)
  })

  it('叶子件不可下钻', () => {
    expect(canDrillInto('asm.gb300.grace-cpu')).toBe(false)
    expect(canDrillInto('asm.gb300.power-shelf')).toBe(false)
  })

  it('GPU→HBM 同为 board 级，不算下钻', () => {
    expect(canDrillInto(GPU)).toBe(false)
  })
})

describe('nextState：cluster → rack → tray → board 全链路', () => {
  const s0 = initialDrillState(SYSTEM_ID)

  it('初始状态在 cluster 且焦点为树根', () => {
    expect(s0).toEqual({ level: 'cluster', focusPath: [ROOT], selectedId: null })
  })

  it('逐级下钻', () => {
    const s1 = nextState(s0, { type: 'drillTo', assemblyId: RACK })
    expect(s1.level).toBe('rack')
    expect(s1.focusPath).toEqual([ROOT, 'asm.gb300.row', RACK])
    expect(s1.selectedId).toBe(RACK)

    const s2 = nextState(s1, { type: 'drillTo', assemblyId: TRAY })
    expect(s2.level).toBe('tray')
    expect(s2.focusPath).toEqual([ROOT, 'asm.gb300.row', RACK, TRAY])

    const s3 = nextState(s2, { type: 'drillTo', assemblyId: GPU })
    expect(s3.level).toBe('board')
    expect(s3.focusPath[s3.focusPath.length - 1]).toBe(GPU)
  })

  it('drillUp 逐级回退到根后停住', () => {
    let s: DrillState = nextState(s0, { type: 'drillTo', assemblyId: GPU })
    expect(s.level).toBe('board')
    s = nextState(s, { type: 'drillUp' })
    expect(s.level).toBe('tray')
    expect(s.focusPath[s.focusPath.length - 1]).toBe(TRAY)
    s = nextState(s, { type: 'drillUp' })
    expect(s.level).toBe('rack')
    expect(s.focusPath[s.focusPath.length - 1]).toBe(RACK)
    s = nextState(s, { type: 'drillUp' })
    expect(s.level).toBe('cluster')
    const atRoot = s
    expect(nextState(atRoot, { type: 'drillUp' })).toEqual(atRoot)
  })

  it('非法 ID 不改变状态', () => {
    expect(nextState(s0, { type: 'drillTo', assemblyId: 'asm.nope' })).toBe(s0)
    expect(nextState(s0, { type: 'select', assemblyId: 'asm.nope' })).toBe(s0)
  })

  it('select 只改选中项，不动层级与焦点', () => {
    const s1 = nextState(s0, { type: 'drillTo', assemblyId: RACK })
    const s2 = nextState(s1, { type: 'select', assemblyId: 'asm.gb300.busbar' })
    expect(s2.level).toBe('rack')
    expect(s2.focusPath).toEqual(s1.focusPath)
    expect(s2.selectedId).toBe('asm.gb300.busbar')
    expect(nextState(s2, { type: 'select', assemblyId: null }).selectedId).toBeNull()
  })

  it('面包屑 jumpTo 回到机架层', () => {
    const deep = nextState(s0, { type: 'drillTo', assemblyId: GPU })
    const back = nextState(deep, { type: 'jumpTo', assemblyId: RACK })
    expect(back.level).toBe('rack')
    expect(back.focusPath).toEqual([ROOT, 'asm.gb300.row', RACK])
  })

  it('applyScene 的显式层级优先于结构推导（托盘拆解场景要求 board 级）', () => {
    const s = nextState(s0, { type: 'applyScene', level: 'board', focusAssemblyId: TRAY })
    expect(s.level).toBe('board')
    expect(s.focusPath[s.focusPath.length - 1]).toBe(TRAY)
  })

  it('reset 回到 cluster 根', () => {
    const deep = nextState(s0, { type: 'drillTo', assemblyId: GPU })
    expect(nextState(deep, { type: 'reset' })).toEqual(s0)
  })

  it('纯函数：不修改传入的 state', () => {
    const before = JSON.stringify(s0)
    nextState(s0, { type: 'drillTo', assemblyId: GPU })
    expect(JSON.stringify(s0)).toBe(before)
  })
})

describe('面包屑推导', () => {
  it('板级焦点给出 机房 → 机架列 → 机架 → 托盘 → GPU', () => {
    const s = nextState(initialDrillState(SYSTEM_ID), { type: 'drillTo', assemblyId: GPU })
    const crumbs = crumbsOf(s.focusPath)
    expect(crumbs.map((c) => c.assemblyId)).toEqual([
      ROOT,
      'asm.gb300.row',
      RACK,
      TRAY,
      GPU,
    ])
    expect(crumbs.map((c) => c.level)).toEqual(['cluster', 'cluster', 'rack', 'tray', 'board'])
    expect(crumbs.filter((c) => c.current)).toHaveLength(1)
    expect(crumbs[crumbs.length - 1]!.current).toBe(true)
    expect(crumbs[0]!.label).toBe('机房')
  })

  it('空 focusPath 给出空面包屑', () => {
    expect(crumbsOf([])).toEqual([])
  })
})

describe('场景挂载锚点（语义 LOD）', () => {
  const s0 = initialDrillState(SYSTEM_ID)

  it('容器推导', () => {
    expect(rackContainerOf(GPU)).toBe(RACK)
    expect(rackContainerOf(RACK)).toBe(RACK)
    expect(trayContainerOf(GPU)).toBe(TRAY)
    expect(trayContainerOf('asm.gb300.nvswitch-asic')).toBe('asm.gb300.nvswitch-tray')
    expect(trayContainerOf(RACK)).toBeNull()
  })

  it('cluster 级只挂集群', () => {
    expect(sceneAnchorOf(s0)).toEqual({ kind: 'cluster' })
  })

  it('rack 级挂焦点机架', () => {
    const s = nextState(s0, { type: 'drillTo', assemblyId: 'asm.gb300.power-shelf' })
    expect(s.level).toBe('rack')
    expect(sceneAnchorOf(s)).toEqual({ kind: 'rack', rackAssemblyId: RACK })
  })

  it('tray 级挂焦点托盘且不 explode', () => {
    const s = nextState(s0, { type: 'drillTo', assemblyId: TRAY })
    expect(sceneAnchorOf(s)).toEqual({ kind: 'tray', trayAssemblyId: TRAY, exploded: false })
  })

  it('board 级挂同一托盘并 explode（「集群总览不挂板级」由结构保证）', () => {
    const s = nextState(s0, { type: 'drillTo', assemblyId: GPU })
    expect(sceneAnchorOf(s)).toEqual({ kind: 'tray', trayAssemblyId: TRAY, exploded: true })
    // 反向：cluster 级永远不会给出 tray 锚点
    expect(sceneAnchorOf({ ...s, level: 'cluster' })).toEqual({ kind: 'cluster' })
  })
})
