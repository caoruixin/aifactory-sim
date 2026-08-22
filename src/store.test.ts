import { beforeEach, describe, expect, it } from 'vitest'
import { FACTORY_PACK } from './data'
import {
  DEFAULT_COMPARE_RIGHT_ID,
  DEFAULT_SYSTEM_ID,
  defaultPlanes,
  detailIdOf,
  focusIdOf,
  sanitizePersisted,
  useFactoryStore,
} from './store'

const RACK = 'asm.gb300.rack'
const TRAY = 'asm.gb300.compute-tray'
const GPU = 'asm.gb300.b300-gpu'

describe('sanitizePersisted（rehydrate 清洗）', () => {
  it('空/垃圾输入回落到默认值', () => {
    const fallback = { planes: defaultPlanes(), reducedMotion: false, generation: DEFAULT_SYSTEM_ID }
    expect(sanitizePersisted(null)).toEqual(fallback)
    expect(sanitizePersisted('nope')).toEqual(fallback)
    expect(sanitizePersisted({})).toEqual(fallback)
  })

  it('只接受六个已知平面键上的布尔值，多余键被丢弃', () => {
    const out = sanitizePersisted({
      planes: { nvlink: false, power: false, bogus: true, mgmt: 'yes' },
    })
    expect(out.planes.nvlink).toBe(false)
    expect(out.planes.power).toBe(false)
    expect(out.planes.mgmt).toBe(true) // 非布尔值被忽略 → 保持默认
    expect(Object.keys(out.planes).sort()).toEqual(
      ['business', 'cooling', 'mgmt', 'nvlink', 'power', 'scaleout'].sort(),
    )
  })

  it('未知 generation（如已删除的代际）回落到默认系统', () => {
    expect(sanitizePersisted({ generation: 'sys.deleted' }).generation).toBe(DEFAULT_SYSTEM_ID)
    const real = FACTORY_PACK.systems[0]!.id
    expect(sanitizePersisted({ generation: real }).generation).toBe(real)
  })

  it('reducedMotion 只认布尔值', () => {
    expect(sanitizePersisted({ reducedMotion: true }).reducedMotion).toBe(true)
    expect(sanitizePersisted({ reducedMotion: 'true' }).reducedMotion).toBe(false)
  })
})

describe('store 转移', () => {
  beforeEach(() => {
    // 代际也要复位：setGeneration 会重建整棵下钻状态，跨用例残留会让断言互相污染。
    useFactoryStore.getState().setGeneration(DEFAULT_SYSTEM_ID)
    useFactoryStore.getState().reset()
    useFactoryStore.setState({
      planes: defaultPlanes(),
      glStatus: 'unknown',
      ready: false,
      compare: { right: DEFAULT_COMPARE_RIGHT_ID, showDiffOnly: false },
    })
  })

  it('初始状态：cluster 级、焦点为机房、六平面全开', () => {
    const s = useFactoryStore.getState()
    expect(s.level).toBe('cluster')
    expect(focusIdOf(s)).toBe('asm.gb300.facility')
    expect(s.selectedId).toBeNull()
    expect(Object.values(s.planes).every(Boolean)).toBe(true)
    expect(s.mode).toBe('explore')
  })

  it('下钻链路 cluster → rack → tray → board 并可逐级回退', () => {
    const st = useFactoryStore.getState()
    st.drillTo(RACK)
    expect(useFactoryStore.getState().level).toBe('rack')
    useFactoryStore.getState().drillTo(TRAY)
    expect(useFactoryStore.getState().level).toBe('tray')
    useFactoryStore.getState().drillTo(GPU)
    expect(useFactoryStore.getState().level).toBe('board')
    expect(focusIdOf(useFactoryStore.getState())).toBe(GPU)

    useFactoryStore.getState().drillUp()
    expect(useFactoryStore.getState().level).toBe('tray')
    useFactoryStore.getState().drillUp()
    expect(useFactoryStore.getState().level).toBe('rack')
    useFactoryStore.getState().drillUp()
    expect(useFactoryStore.getState().level).toBe('cluster')
  })

  it('select 不改层级；detailIdOf 在未选中时退回焦点', () => {
    useFactoryStore.getState().drillTo(RACK)
    useFactoryStore.getState().select('asm.gb300.busbar')
    const s = useFactoryStore.getState()
    expect(s.level).toBe('rack')
    expect(detailIdOf(s)).toBe('asm.gb300.busbar')

    useFactoryStore.getState().select(null)
    expect(detailIdOf(useFactoryStore.getState())).toBe(RACK)
  })

  it('hover 同值不产生新状态对象（避免无谓重渲染）', () => {
    useFactoryStore.getState().hover(RACK)
    const a = useFactoryStore.getState()
    useFactoryStore.getState().hover(RACK)
    expect(useFactoryStore.getState()).toBe(a)
  })

  it('平面开关：toggle 与批量设置', () => {
    useFactoryStore.getState().togglePlane('nvlink')
    expect(useFactoryStore.getState().planes.nvlink).toBe(false)
    useFactoryStore.getState().setPlanes({ nvlink: true, power: false })
    expect(useFactoryStore.getState().planes).toMatchObject({ nvlink: true, power: false })
  })

  it('applyScene 同时设置层级、焦点、平面与导览序号', () => {
    const scene = FACTORY_PACK.scenes.find((s) => s.id === 'scene.gb300.tray-teardown')!
    useFactoryStore.getState().applyScene(scene.id)
    const s = useFactoryStore.getState()
    expect(s.level).toBe(scene.lodLevel)
    expect(focusIdOf(s)).toBe(scene.focusAssemblyId)
    expect(s.mode).toBe('tour')
    expect(s.tourStopIdx).toBe(FACTORY_PACK.scenes.findIndex((x) => x.id === scene.id))
    for (const [plane, on] of Object.entries(s.planes)) {
      expect(on).toBe(scene.planes.includes(plane as never))
    }
  })

  it('未知场景 ID 不改变任何状态', () => {
    const before = useFactoryStore.getState()
    useFactoryStore.getState().applyScene('scene.nope')
    expect(useFactoryStore.getState()).toBe(before)
  })

  it('reset 清回集群总览与 explore 模式', () => {
    useFactoryStore.getState().drillTo(GPU)
    useFactoryStore.getState().hover(GPU)
    useFactoryStore.getState().setMode('tour')
    useFactoryStore.getState().reset()
    const s = useFactoryStore.getState()
    expect(s.level).toBe('cluster')
    expect(s.selectedId).toBeNull()
    expect(s.hoveredId).toBeNull()
    expect(s.mode).toBe('explore')
    expect(s.tourStopIdx).toBe(-1)
  })

  it('★ 切换代际：换整棵装配树，下钻状态回到新系统的根', () => {
    useFactoryStore.getState().drillTo(GPU)
    useFactoryStore.getState().setGeneration('sys.vera-rubin-nvl72')
    const s = useFactoryStore.getState()
    expect(s.generation).toBe('sys.vera-rubin-nvl72')
    expect(s.level).toBe('cluster')
    expect(focusIdOf(s)).toBe('asm.rubin.facility')
    expect(s.selectedId).toBeNull()
    expect(s.tourStopIdx).toBe(-1)
    expect(s.flow.playing).toBe(false)
    // 焦点必须真的属于新系统（不能残留上一代的 ID）
    expect(FACTORY_PACK.assemblies.find((a) => a.id === focusIdOf(s))!.systemId).toBe(
      'sys.vera-rubin-nvl72',
    )
  })

  it('切换代际时右侧比较对象自动避开与左侧同代', () => {
    useFactoryStore.getState().setCompare({ right: 'sys.vera-rubin-nvl72' })
    useFactoryStore.getState().setGeneration('sys.vera-rubin-nvl72')
    expect(useFactoryStore.getState().compare.right).not.toBe('sys.vera-rubin-nvl72')
  })

  it('未知代际 / 同代际不改变状态', () => {
    const before = useFactoryStore.getState()
    useFactoryStore.getState().setGeneration('sys.nope')
    expect(useFactoryStore.getState()).toBe(before)
    useFactoryStore.getState().setGeneration(before.generation)
    expect(useFactoryStore.getState()).toBe(before)
  })

  it('compare 状态：右侧代际与 showDiffOnly 可独立设置', () => {
    useFactoryStore.getState().setMode('compare')
    useFactoryStore.getState().setCompare({ right: 'sys.rubin-ultra-nvl576' })
    useFactoryStore.getState().setCompare({ showDiffOnly: true })
    const s = useFactoryStore.getState()
    expect(s.mode).toBe('compare')
    expect(s.compare).toEqual({ right: 'sys.rubin-ultra-nvl576', showDiffOnly: true })
  })

  it('applyScene 会把代际切到该场景所属的系统', () => {
    useFactoryStore.getState().applyScene('scene.rubin.tray-teardown')
    const s = useFactoryStore.getState()
    expect(s.generation).toBe('sys.vera-rubin-nvl72')
    expect(focusIdOf(s)).toBe('asm.rubin.compute-tray')
    // 序号是「该系统内」的次序，不是全包全局次序
    expect(s.tourStopIdx).toBe(1)
  })

  it('glStatus / ready 可被 3D 层回写', () => {
    useFactoryStore.getState().setGlStatus('failed')
    useFactoryStore.getState().setReady(true)
    expect(useFactoryStore.getState().glStatus).toBe('failed')
    expect(useFactoryStore.getState().ready).toBe(true)
  })
})
