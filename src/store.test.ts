import { beforeEach, describe, expect, it } from 'vitest'
import { FACTORY_PACK } from './data'
import { DEFAULT_LENS_ID, activeLensChapter, lensChapterAt } from './lib/lens'
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
      // 切面状态不落盘也不被 reset() 清，跨用例残留会污染「续读」与空态断言。
      lens: { lensId: null, chapterIdx: -1 },
      flow: { episodeIdx: 0, stepIdx: 0, playing: false, speed: 1 },
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

  // ─────────── 代际轮转 + 比较双方的清洗与原子交换（v1.3 W3 起；v1.4 W-C 扩到五系统） ───────────

  it('★ 五系统轮转：切到任何一代，右侧都自动落在一个合法的他系统上', () => {
    const ids = FACTORY_PACK.systems.map((s) => s.id)
    expect(ids.length).toBe(5)
    for (const id of ids) {
      useFactoryStore.getState().setGeneration(id)
      const s = useFactoryStore.getState()
      expect(s.generation, id).toBe(id)
      expect(s.compare.right, `${id} 的右侧不该等于左侧`).not.toBe(id)
      expect(ids, `${id} 的右侧必须是已登记的系统`).toContain(s.compare.right)
    }
  })

  it('★ setCompare 清洗未知 ID：?right=sys.nope 不会把 select 打成空值', () => {
    useFactoryStore.getState().setCompare({ right: 'sys.nope' })
    const right = useFactoryStore.getState().compare.right
    expect(FACTORY_PACK.systems.some((s) => s.id === right)).toBe(true)
    expect(right).not.toBe('sys.nope')
    expect(right).not.toBe(useFactoryStore.getState().generation)
  })

  it('★ setCompare 清洗「右侧 = 左侧」：比较视图不允许左右同代', () => {
    const left = useFactoryStore.getState().generation
    useFactoryStore.getState().setCompare({ right: left })
    expect(useFactoryStore.getState().compare.right).not.toBe(left)
  })

  it('setCompare 只改 showDiffOnly 时不会误伤已经合法的右侧', () => {
    useFactoryStore.getState().setCompare({ right: 'sys.groq3-lpx' })
    useFactoryStore.getState().setCompare({ showDiffOnly: true })
    expect(useFactoryStore.getState().compare.right).toBe('sys.groq3-lpx')
    expect(useFactoryStore.getState().compare.showDiffOnly).toBe(true)
  })

  /**
   * 20 个有序组合（5 系统 × 4 个他系统）逐个验证 swap 的两条性质：
   *   ① 一次交换 = 左右恰好对调（**旧左必须成为新右**——这正是两步写法
   *      setGeneration + setCompare 做不到的，setGeneration 会把旧左冲掉）；
   *   ② 交换两次必然复原（对合性）。
   */
  it('★ swapCompareSides：全部 20 个有序组合，交换一次对调、交换两次复原', () => {
    const ids = FACTORY_PACK.systems.map((s) => s.id)
    let pairs = 0
    for (const left of ids) {
      for (const right of ids) {
        if (left === right) continue
        pairs += 1

        useFactoryStore.getState().setGeneration(left)
        useFactoryStore.getState().setCompare({ right })
        expect(useFactoryStore.getState().generation, `${left}|${right} 起点左侧`).toBe(left)
        expect(useFactoryStore.getState().compare.right, `${left}|${right} 起点右侧`).toBe(right)

        // ① 一次交换
        useFactoryStore.getState().swapCompareSides()
        const once = useFactoryStore.getState()
        expect(once.generation, `${left}|${right} 交换后左侧`).toBe(right)
        expect(once.compare.right, `${left}|${right} 交换后右侧（旧左必须保住）`).toBe(left)

        // ② 再交换一次 → 复原
        useFactoryStore.getState().swapCompareSides()
        const twice = useFactoryStore.getState()
        expect(twice.generation, `${left}|${right} 复原左侧`).toBe(left)
        expect(twice.compare.right, `${left}|${right} 复原右侧`).toBe(right)
      }
    }
    expect(pairs, '5 个系统应有 20 个有序组合').toBe(20)
  })

  it('swapCompareSides 重置下钻状态（换系统 = 换整棵装配树），但保留 mode 与 showDiffOnly', () => {
    useFactoryStore.getState().setGeneration(DEFAULT_SYSTEM_ID)
    useFactoryStore.getState().setCompare({ right: 'sys.groq3-lpx', showDiffOnly: true })
    useFactoryStore.getState().setMode('compare')
    useFactoryStore.getState().drillTo(GPU)
    expect(focusIdOf(useFactoryStore.getState())).toBe(GPU)

    useFactoryStore.getState().swapCompareSides()
    const s = useFactoryStore.getState()
    expect(s.generation).toBe('sys.groq3-lpx')
    expect(s.compare.right).toBe(DEFAULT_SYSTEM_ID)
    // 下钻状态回到新系统的根，不残留上一代的 ID
    expect(s.level).toBe('cluster')
    expect(s.selectedId).toBeNull()
    expect(focusIdOf(s)).toBe('asm.lpx.facility')
    expect(FACTORY_PACK.assemblies.find((a) => a.id === focusIdOf(s))!.systemId).toBe('sys.groq3-lpx')
    // 视角偏好不动
    expect(s.mode).toBe('compare')
    expect(s.compare.showDiffOnly).toBe(true)
  })

  it('swapCompareSides 在右侧非法时是空操作（不会把 generation 换成不存在的系统）', () => {
    useFactoryStore.setState({ compare: { right: 'sys.nope', showDiffOnly: false } })
    const before = useFactoryStore.getState()
    useFactoryStore.getState().swapCompareSides()
    expect(useFactoryStore.getState()).toBe(before)
  })

  // ─────────── 领域切面（v1.6 W-B：一次原子 set / 换代收尾 / 与导览互斥） ───────────

  it('setLens：进入切面 → 模式、代际、层级、焦点、平面、章节序号一次到位', () => {
    useFactoryStore.getState().setLens('lens.network')
    const s = useFactoryStore.getState()
    const chapter = lensChapterAt('lens.network', 0)!
    expect(s.mode).toBe('lens')
    expect(s.lens).toEqual({ lensId: 'lens.network', chapterIdx: 0 })
    expect(s.generation).toBe(chapter.systemId)
    expect(s.level).toBe(chapter.lodLevel)
    expect(focusIdOf(s)).toBe(chapter.focusAssemblyId)
    for (const [plane, on] of Object.entries(s.planes)) {
      expect(on, plane).toBe(chapter.planes.includes(plane as never))
    }
  })

  it('setLens 接受深链短名，并在同一条切面上「续读」上次的章节', () => {
    useFactoryStore.getState().setLens('network', 3)
    expect(useFactoryStore.getState().lens.chapterIdx).toBe(3)
    // 离开又回来：不带序号 → 回到第 3 章
    useFactoryStore.getState().setMode('explore')
    useFactoryStore.getState().setLens('network')
    expect(useFactoryStore.getState().lens.chapterIdx).toBe(3)
    // 换一条切面 → 从第 0 章起
    useFactoryStore.getState().setLens('storage')
    expect(useFactoryStore.getState().lens).toEqual({ lensId: 'lens.storage', chapterIdx: 0 })
  })

  it('未知切面 / 越界章节序号不改变任何状态', () => {
    useFactoryStore.getState().setLens('lens.network')
    const before = useFactoryStore.getState()
    useFactoryStore.getState().setLens('lens.nope')
    expect(useFactoryStore.getState()).toBe(before)
    useFactoryStore.getState().setLensChapter(99)
    expect(useFactoryStore.getState()).toBe(before)
    useFactoryStore.getState().setLensChapter(-1)
    expect(useFactoryStore.getState()).toBe(before)
  })

  it('★ setLensChapter 是**一次** set：跨代章节的代际+层级+焦点同批落地（相机只飞一次）', () => {
    useFactoryStore.getState().setLens('lens.network', 0)
    expect(useFactoryStore.getState().generation).toBe('sys.gb300-nvl72')

    const seen: { generation: string; level: string; focus: string | null }[] = []
    const unsub = useFactoryStore.subscribe((s) =>
      seen.push({ generation: s.generation, level: s.level, focus: focusIdOf(s) }),
    )
    // 第 3 章 pin 在 Vera Rubin（跨代）
    useFactoryStore.getState().setLensChapter(2)
    unsub()

    const chapter = lensChapterAt('lens.network', 2)!
    expect(chapter.systemId).toBe('sys.vera-rubin-nvl72')
    expect(seen).toHaveLength(1) // ★ 只有一次状态转移，不存在「先换代再落焦点」的中间态
    expect(seen[0]).toEqual({
      generation: chapter.systemId,
      level: chapter.lodLevel,
      focus: chapter.focusAssemblyId,
    })
  })

  it('★ 跨代章节的换代收尾：flow 停播、hover 清空、compare 右侧避开同代', () => {
    useFactoryStore.getState().setLens('lens.network', 0)
    useFactoryStore.getState().setFlow({ playing: true, stepIdx: 3 })
    useFactoryStore.getState().hover(RACK)
    useFactoryStore.getState().setCompare({ right: 'sys.vera-rubin-nvl72' })

    useFactoryStore.getState().setLensChapter(2) // → Vera Rubin
    const s = useFactoryStore.getState()
    expect(s.generation).toBe('sys.vera-rubin-nvl72')
    expect(s.flow.playing).toBe(false)
    expect(s.flow.stepIdx).toBe(0)
    expect(s.hoveredId).toBeNull()
    expect(s.compare.right).not.toBe('sys.vera-rubin-nvl72')
    expect(FACTORY_PACK.systems.some((x) => x.id === s.compare.right)).toBe(true)
  })

  it('同代章节之间切换不打断播放（只有换代才收尾）', () => {
    useFactoryStore.getState().setLens('lens.network', 0)
    useFactoryStore.getState().setFlow({ playing: true, stepIdx: 2 })
    useFactoryStore.getState().setLensChapter(1) // 同为 GB300
    const s = useFactoryStore.getState()
    expect(s.generation).toBe('sys.gb300-nvl72')
    expect(s.flow.playing).toBe(true)
    expect(s.flow.stepIdx).toBe(2)
  })

  it('★ 切面与导览互斥：进切面清掉导览站号，进导览站不残留切面高亮', () => {
    useFactoryStore.getState().applyScene('scene.gb300.learn-plane-nvlink')
    expect(useFactoryStore.getState().tourStopIdx).toBeGreaterThanOrEqual(0)

    useFactoryStore.getState().setLens('lens.network')
    expect(useFactoryStore.getState().mode).toBe('lens')
    expect(useFactoryStore.getState().tourStopIdx).toBe(-1)

    useFactoryStore.getState().applyScene('scene.gb300.learn-plane-nvlink')
    expect(useFactoryStore.getState().mode).toBe('tour')
    // 序号还在（续读靠它），但 mode 已经不是 lens ⇒ activeLensChapter 判定为「不在切面中」
    expect(activeLensChapter(useFactoryStore.getState().mode, useFactoryStore.getState().lens)).toBeNull()
  })

  it('★ 手动换代：章节序号清成 -1（显式空态），lensId 与 mode 保持不变', () => {
    useFactoryStore.getState().setLens('lens.network', 1)
    useFactoryStore.getState().setGeneration('sys.groq3-lpx')
    const s = useFactoryStore.getState()
    expect(s.mode).toBe('lens')
    expect(s.lens).toEqual({ lensId: 'lens.network', chapterIdx: -1 })
    expect(activeLensChapter(s.mode, s.lens)).toBeNull()
    // 再点任意一章即可恢复（代际随章节回到 pin 的那一代）
    useFactoryStore.getState().setLensChapter(1)
    expect(useFactoryStore.getState().generation).toBe(lensChapterAt('lens.network', 1)!.systemId)
  })

  it('没有当前切面时 setLensChapter 回落到默认切面（?mode=lens 单独出现的兜底）', () => {
    expect(useFactoryStore.getState().lens.lensId).toBeNull()
    useFactoryStore.getState().setLensChapter(0)
    expect(useFactoryStore.getState().lens.lensId).toBe(DEFAULT_LENS_ID)
  })

  it('reset 退出切面（mode 回 explore），但保留 lensId 供下次续读', () => {
    useFactoryStore.getState().setLens('lens.storage', 2)
    useFactoryStore.getState().reset()
    const s = useFactoryStore.getState()
    expect(s.mode).toBe('explore')
    expect(activeLensChapter(s.mode, s.lens)).toBeNull()
    expect(s.lens.lensId).toBe('lens.storage')
  })

  it('lens 不落盘（partialize 白名单只有三项）', () => {
    useFactoryStore.getState().setLens('lens.network', 2)
    const raw = JSON.stringify(sanitizePersisted({ ...useFactoryStore.getState() }))
    expect(raw).not.toContain('lens.network')
    expect(Object.keys(sanitizePersisted({})).sort()).toEqual(
      ['generation', 'planes', 'reducedMotion'].sort(),
    )
  })

  it('glStatus / ready 可被 3D 层回写', () => {
    useFactoryStore.getState().setGlStatus('failed')
    useFactoryStore.getState().setReady(true)
    expect(useFactoryStore.getState().glStatus).toBe('failed')
    expect(useFactoryStore.getState().ready).toBe(true)
  })
})
