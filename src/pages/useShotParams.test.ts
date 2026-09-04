/**
 * 深链播种（`parseShotParams` 纯解析 + `applyShotParams` 优先级矩阵）。
 *
 * ★ 这里钉住的是 `useShotParams.ts` 顶部那段「优先级矩阵」注释所写的**规范**：
 *   矩阵改了测试必红，测试改了规范注释也得跟着改——两边只有一个真相。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { FACTORY_PACK, lensById, scenesOfSystem } from '../data'
import { lensChapterAt } from '../lib/lens'
import {
  DEFAULT_COMPARE_RIGHT_ID,
  DEFAULT_SYSTEM_ID,
  defaultPlanes,
  focusIdOf,
  useFactoryStore,
} from '../store'
import { applyShotParams, parseShotParams } from './useShotParams'

const GB300 = 'sys.gb300-nvl72'
const VR = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'
const LPX = 'sys.groq3-lpx'

const NVLINK_TOUR = 'scene.gb300.learn-plane-nvlink'
const SWITCH_TOUR = 'scene.gb300.learn-switch-layers'

/** 从 query 串一路走到 store（就是 `useShotParams` 的 effect 除 gl/motion 之外的部分）。 */
function seed(search: string): void {
  applyShotParams(parseShotParams(search))
}

function state() {
  return useFactoryStore.getState()
}

function openPlanes(): string[] {
  const p = state().planes
  return Object.keys(p).filter((k) => p[k as keyof typeof p])
}

function stopIdxOf(systemId: string, sceneId: string): number {
  return scenesOfSystem(systemId).findIndex((s) => s.id === sceneId)
}

beforeEach(() => {
  useFactoryStore.getState().setGeneration(DEFAULT_SYSTEM_ID)
  useFactoryStore.getState().reset()
  useFactoryStore.setState({
    planes: defaultPlanes(),
    glStatus: 'unknown',
    ready: false,
    compare: { right: DEFAULT_COMPARE_RIGHT_ID, showDiffOnly: false },
    // 切面状态既不落盘也不被 reset() 清：不显式复位会让「续读」把上一条用例的章节带过来。
    lens: { lensId: null, chapterIdx: -1 },
  })
})

describe('parseShotParams（纯解析）', () => {
  it('空串 → 全空，没有任何隐式默认值', () => {
    expect(parseShotParams('')).toEqual({
      level: null,
      focus: null,
      planes: null,
      motionOff: false,
      glOff: false,
      generation: null,
      mode: null,
      compareRight: null,
      tour: null,
      lens: null,
      chapter: null,
    })
  })

  it('lens 原样透传、chapter 只认整数（合法性留给 applyShotParams）', () => {
    expect(parseShotParams('?lens=network&chapter=2')).toMatchObject({ lens: 'network', chapter: 2 })
    expect(parseShotParams('?lens=lens.storage').lens).toBe('lens.storage')
    expect(parseShotParams('?lens=nope').lens).toBe('nope')
    expect(parseShotParams('?chapter=abc').chapter).toBeNull()
    expect(parseShotParams('?chapter=2.7').chapter).toBeNull()
    expect(parseShotParams('?chapter=-1').chapter).toBe(-1)
  })

  it('mode=lens 是合法枚举值（v1.6 起第四个模式）', () => {
    expect(parseShotParams('?mode=lens').mode).toBe('lens')
  })

  it('tour 原样透传（合法性留给 applyShotParams 查内容包）', () => {
    expect(parseShotParams(`?tour=${NVLINK_TOUR}`).tour).toBe(NVLINK_TOUR)
    expect(parseShotParams('?tour=scene.nope').tour).toBe('scene.nope')
  })

  it('非法 level / mode / plane 一律丢弃而不是报错', () => {
    const p = parseShotParams('?level=galaxy&mode=zen&planes=nvlink,teleport,power')
    expect(p.level).toBeNull()
    expect(p.mode).toBeNull()
    expect(p.planes).toEqual(['nvlink', 'power'])
  })

  it('其余参数照旧', () => {
    const p = parseShotParams(
      `?level=board&focus=asm.gb300.b300-gpu&gen=${VR}&mode=compare&right=${NVL576}&motion=off&gl=off`,
    )
    expect(p).toMatchObject({
      level: 'board',
      focus: 'asm.gb300.b300-gpu',
      generation: VR,
      mode: 'compare',
      compareRight: NVL576,
      motionOff: true,
      glOff: true,
    })
  })
})

describe('?tour= 基座', () => {
  it('已知场景：层级/焦点/平面/站号/模式一次到位', () => {
    seed(`?tour=${NVLINK_TOUR}`)
    const s = state()
    expect(s.mode).toBe('tour')
    expect(s.generation).toBe(GB300)
    expect(s.level).toBe('rack')
    expect(focusIdOf(s)).toBe('asm.gb300.rack')
    expect(openPlanes()).toEqual(['nvlink'])
    expect(s.tourStopIdx).toBe(stopIdxOf(GB300, NVLINK_TOUR))
  })

  it('未知场景：整条忽略，store 保持默认（不报错、不清场）', () => {
    seed('?tour=scene.does-not-exist')
    const s = state()
    expect(s.mode).toBe('explore')
    expect(s.tourStopIdx).toBe(-1)
    expect(s.generation).toBe(DEFAULT_SYSTEM_ID)
    expect(openPlanes()).toHaveLength(6)
  })

  it('tour 会把代际切到场景所属系统（不需要再写 gen）', () => {
    seed('?tour=scene.rubin.learn-gen-delta')
    expect(state().generation).toBe(VR)
    expect(state().tourStopIdx).toBe(stopIdxOf(VR, 'scene.rubin.learn-gen-delta'))
  })
})

describe('优先级矩阵：tour 基座 + 显式参数逐项覆盖', () => {
  it('显式 planes 覆盖场景平面（排在 applyScene 之后才不会被冲掉）', () => {
    seed(`?tour=${NVLINK_TOUR}&planes=power,cooling`)
    expect(openPlanes()).toEqual(['power', 'cooling'])
    expect(state().tourStopIdx).toBe(stopIdxOf(GB300, NVLINK_TOUR)) // 站号不受影响
  })

  it('显式 level 覆盖场景层级', () => {
    seed(`?tour=${NVLINK_TOUR}&level=cluster`)
    expect(state().level).toBe('cluster')
  })

  it('显式 focus（同系统）覆盖场景焦点，level 再覆盖一次', () => {
    seed(`?tour=${NVLINK_TOUR}&focus=asm.gb300.compute-tray&level=board`)
    expect(focusIdOf(state())).toBe('asm.gb300.compute-tray')
    expect(state().level).toBe('board')
  })

  it('显式 mode 覆盖 applyScene 强制的 tour', () => {
    seed(`?tour=${NVLINK_TOUR}&mode=explore`)
    expect(state().mode).toBe('explore')
    // 场景本身已经播下去了（层级/焦点/平面都在），只是不再是导览态
    expect(state().level).toBe('rack')
    expect(openPlanes()).toEqual(['nvlink'])
  })

  it('显式 mode=compare + right 与 tour 共存时，比较模式赢', () => {
    seed(`?tour=${SWITCH_TOUR}&mode=compare&right=${NVL576}`)
    expect(state().mode).toBe('compare')
    expect(state().compare.right).toBe(NVL576)
  })
})

describe('focus 校验：必须属于**最终** generation', () => {
  it('跨系统 focus 被忽略（不把界面指到另一棵树）', () => {
    seed(`?gen=${VR}&focus=asm.gb300.compute-tray`)
    const s = state()
    expect(s.generation).toBe(VR)
    expect(focusIdOf(s)).toBe('asm.rubin.facility') // 仍是新系统的根
  })

  it('focus 属于显式 gen 指定的系统时正常生效', () => {
    seed(`?gen=${VR}&focus=asm.rubin.compute-tray`)
    expect(focusIdOf(state())).toBe('asm.rubin.compute-tray')
  })

  it('不存在的 focus 同样忽略', () => {
    seed('?focus=asm.nope.thing')
    expect(focusIdOf(state())).toBe('asm.gb300.facility')
  })

  it('校验的是**最终** generation：tour 定在 GB300、gen 改到 VR，则 GB300 的 focus 失效', () => {
    seed(`?tour=${NVLINK_TOUR}&gen=${VR}&focus=asm.gb300.rack`)
    expect(state().generation).toBe(VR)
    expect(focusIdOf(state())).toBe('asm.rubin.facility')
  })
})

describe('跨系统规则：显式 gen 指向他系统时，场景序号绝不复用', () => {
  it('无显式 mode → 清空场景并退出导览（回 explore）', () => {
    seed(`?tour=${NVLINK_TOUR}&gen=${VR}`)
    const s = state()
    expect(s.generation).toBe(VR)
    expect(s.tourStopIdx).toBe(-1) // 绝不把 GB300 的第 4 站序号搬到 VR 上
    expect(s.mode).toBe('explore')
  })

  it('显式 mode=tour → 进入**新系统的首站**（而不是沿用原序号）', () => {
    seed(`?tour=${NVLINK_TOUR}&gen=${VR}&mode=tour`)
    const s = state()
    expect(s.generation).toBe(VR)
    expect(s.mode).toBe('tour')
    expect(s.tourStopIdx).toBe(0)
    expect(focusIdOf(s)).toBe(scenesOfSystem(VR)[0]!.focusAssemblyId)
    // 关键反例：原场景在 GB300 里的序号是 3，绝不能变成 VR 的第 3 站
    expect(stopIdxOf(GB300, NVLINK_TOUR)).toBeGreaterThan(0)
  })

  it('显式 mode=explore/compare → 场景保持清空，模式按显式值', () => {
    seed(`?tour=${NVLINK_TOUR}&gen=${VR}&mode=compare`)
    expect(state().mode).toBe('compare')
    expect(state().tourStopIdx).toBe(-1)

    useFactoryStore.getState().setGeneration(DEFAULT_SYSTEM_ID)
    useFactoryStore.getState().reset()
    seed(`?tour=${NVLINK_TOUR}&gen=${NVL576}&mode=explore`)
    expect(state().generation).toBe(NVL576)
    expect(state().mode).toBe('explore')
    expect(state().tourStopIdx).toBe(-1)
  })

  it('gen 与场景**同**系统时不触发跨系统规则（照常停在该站）', () => {
    seed(`?tour=${NVLINK_TOUR}&gen=${GB300}`)
    const s = state()
    expect(s.mode).toBe('tour')
    expect(s.tourStopIdx).toBe(stopIdxOf(GB300, NVLINK_TOUR))
  })

  it('跨系统 + 显式 mode=tour 时，后续显式 planes/level 仍能覆盖新首站', () => {
    seed(`?tour=${NVLINK_TOUR}&gen=${VR}&mode=tour&planes=cooling&level=cluster`)
    expect(state().generation).toBe(VR)
    expect(state().tourStopIdx).toBe(0)
    expect(openPlanes()).toEqual(['cooling'])
    expect(state().level).toBe('cluster')
  })
})

describe('?right= 清洗（v1.3 W3：经 store.setCompare 统一把关）', () => {
  it('合法的他系统原样落地——包括第四代 Groq 3 LPX', () => {
    seed(`?right=${LPX}`)
    expect(state().compare.right).toBe(LPX)
  })

  it('★ 未知 ID 被清洗成一个合法的他系统（不会让 <select> 拿到不存在的 value）', () => {
    seed('?right=sys.nope')
    const right = state().compare.right
    expect(right).not.toBe('sys.nope')
    expect(FACTORY_PACK.systems.some((s) => s.id === right)).toBe(true)
    expect(right).not.toBe(state().generation)
  })

  it('★ 与左侧同代的 ?right= 被清洗（比较视图不允许左右同代）', () => {
    seed(`?gen=${LPX}&right=${LPX}`)
    expect(state().generation).toBe(LPX)
    expect(state().compare.right).not.toBe(LPX)
  })

  it('?right= 在 ?gen= **之后**落地：按最终代际判「同不同代」，而不是按默认代际', () => {
    // 右侧写的是 GB300（默认代际）；因为 gen 把左侧换成了 GB300，右侧必须被清洗掉。
    seed(`?gen=${GB300}&right=${GB300}`)
    expect(state().generation).toBe(GB300)
    expect(state().compare.right).not.toBe(GB300)
    // 反过来：左侧是 LPX 时，GB300 是合法右侧，应原样保留。
    seed(`?gen=${LPX}&right=${GB300}`)
    expect(state().generation).toBe(LPX)
    expect(state().compare.right).toBe(GB300)
  })

  it('四代 × 每个合法右侧：深链落地后左右必定不同代', () => {
    const ids = FACTORY_PACK.systems.map((s) => s.id)
    for (const gen of ids) {
      for (const right of ids) {
        seed(`?gen=${gen}&right=${right}`)
        expect(state().generation, `${gen}|${right}`).toBe(gen)
        expect(state().compare.right, `${gen}|${right} 左右同代`).not.toBe(gen)
        expect(ids, `${gen}|${right} 右侧非法`).toContain(state().compare.right)
      }
    }
  })
})

// ─────────────────────────── v1.6：?lens= / ?chapter= ───────────────────────────

/** 期望值一律从纯函数取，不在测试里抄一份章节内容（抄了就会与内容包分叉）。 */
function chapterOf(lensId: string, idx: number) {
  return lensChapterAt(lensId, idx)!
}

const NETWORK = 'lens.network'
const STORAGE = 'lens.storage'
/** 网络切面里第一个 Vera Rubin 章的下标（在网计算 SHARP 那一章）。 */
const VR_CHAPTER_IDX = lensById(NETWORK)!.chapters.findIndex((c) => c.systemId === VR)

describe('?lens= 基座：一次到位', () => {
  it('lens + chapter 一次写入模式/代际/层级/焦点/平面/章节序号', () => {
    seed(`?lens=network&chapter=1`)
    const s = state()
    const chapter = chapterOf(NETWORK, 0)
    expect(s.mode).toBe('lens')
    expect(s.lens).toEqual({ lensId: NETWORK, chapterIdx: 0 })
    expect(s.generation).toBe(chapter.systemId)
    expect(s.level).toBe(chapter.lodLevel)
    expect(focusIdOf(s)).toBe(chapter.focusAssemblyId)
    expect(openPlanes()).toEqual(chapter.planes)
    expect(s.tourStopIdx).toBe(-1)
  })

  it('短名与全 id 等价', () => {
    seed(`?lens=${NETWORK}&chapter=2`)
    expect(state().lens).toEqual({ lensId: NETWORK, chapterIdx: 1 })
    seed('?lens=storage&chapter=1')
    expect(state().lens).toEqual({ lensId: STORAGE, chapterIdx: 0 })
  })

  it('chapter 缺省 = 第 1 章（1 起算，不是数组下标）', () => {
    seed('?lens=storage')
    expect(state().lens.chapterIdx).toBe(0)
    seed('?lens=storage&chapter=3')
    expect(state().lens.chapterIdx).toBe(2)
  })

  it('★ chapter 越界（0 / 负数 / 超出章节数 / 非数字）一律回落第 1 章，不空态', () => {
    for (const q of ['?lens=network&chapter=0', '?lens=network&chapter=-2', '?lens=network&chapter=99', '?lens=network&chapter=abc']) {
      seed(q)
      expect(state().lens, q).toEqual({ lensId: NETWORK, chapterIdx: 0 })
      expect(state().mode, q).toBe('lens')
    }
  })

  it('未知 lens 整条忽略：store 保持默认（不报错、不清场）', () => {
    seed('?lens=nope&chapter=2')
    const s = state()
    expect(s.mode).toBe('explore')
    expect(s.lens).toEqual({ lensId: null, chapterIdx: -1 })
    expect(s.generation).toBe(DEFAULT_SYSTEM_ID)
    expect(openPlanes()).toHaveLength(6)
  })

  it('跨代章节自带换代（不需要再写 gen）', () => {
    seed(`?lens=network&chapter=${VR_CHAPTER_IDX + 1}`)
    expect(state().generation).toBe(VR)
    expect(focusIdOf(state())).toBe(chapterOf(NETWORK, VR_CHAPTER_IDX).focusAssemblyId)
  })
})

describe('★ lens 基座与 tour 基座互斥：lens 赢', () => {
  it('两个基座同时出现时 tour 整条忽略', () => {
    seed(`?tour=${NVLINK_TOUR}&lens=storage&chapter=1`)
    const s = state()
    const chapter = chapterOf(STORAGE, 0)
    expect(s.mode).toBe('lens')
    expect(s.lens).toEqual({ lensId: STORAGE, chapterIdx: 0 })
    expect(s.tourStopIdx).toBe(-1) // 导览站号绝不与切面并存
    expect(s.level).toBe(chapter.lodLevel)
    expect(openPlanes()).toEqual(chapter.planes)
  })

  it('lens 不合法时不算基座，tour 照常生效', () => {
    seed(`?tour=${NVLINK_TOUR}&lens=nope`)
    const s = state()
    expect(s.mode).toBe('tour')
    expect(s.tourStopIdx).toBe(stopIdxOf(GB300, NVLINK_TOUR))
    expect(s.lens.lensId).toBeNull()
  })
})

describe('优先级矩阵：lens 基座 + 显式参数逐项覆盖', () => {
  it('显式 planes 覆盖章节平面（章节序号不受影响）', () => {
    seed('?lens=network&chapter=1&planes=power,cooling')
    expect(openPlanes()).toEqual(['power', 'cooling'])
    expect(state().lens.chapterIdx).toBe(0)
  })

  it('显式 level / focus 覆盖章节视角', () => {
    seed('?lens=network&chapter=1&focus=asm.gb300.compute-tray&level=board')
    expect(focusIdOf(state())).toBe('asm.gb300.compute-tray')
    expect(state().level).toBe('board')
    expect(state().mode).toBe('lens') // 仍在切面里，只是偏离了本章视角
  })

  it('显式 mode=explore 覆盖 setLens 强制的 lens（章节内容已经播下去了）', () => {
    seed('?lens=network&chapter=1&mode=explore')
    expect(state().mode).toBe('explore')
    expect(state().level).toBe(chapterOf(NETWORK, 0).lodLevel)
    expect(openPlanes()).toEqual(chapterOf(NETWORK, 0).planes)
  })

  it('显式 mode=compare + right 与 lens 共存时，比较模式赢', () => {
    seed(`?lens=storage&chapter=1&mode=compare&right=${NVL576}`)
    expect(state().mode).toBe('compare')
    expect(state().compare.right).toBe(NVL576)
  })
})

describe('跨系统规则 B：显式 gen 与章节 pin 的代际冲突', () => {
  it('无显式 mode → 清章节并退出切面（回 explore）', () => {
    seed(`?lens=network&chapter=1&gen=${VR}`)
    const s = state()
    expect(s.generation).toBe(VR)
    expect(s.lens.chapterIdx).toBe(-1) // 绝不把 GB300 那一章的序号搬到 VR 上
    expect(s.mode).toBe('explore')
  })

  it('显式 mode=lens → 跳到该切面里**第一个同代章节**', () => {
    seed(`?lens=network&chapter=1&gen=${VR}&mode=lens`)
    const s = state()
    expect(s.generation).toBe(VR)
    expect(s.mode).toBe('lens')
    expect(s.lens.chapterIdx).toBe(VR_CHAPTER_IDX)
    expect(chapterOf(NETWORK, s.lens.chapterIdx).systemId).toBe(VR)
    expect(VR_CHAPTER_IDX).toBeGreaterThan(0) // 关键反例：不是沿用原序号 0
  })

  it('★ 显式 mode=lens 但这一代在本切面里没有章节 → 退 explore（不留空壳）', () => {
    seed(`?lens=network&chapter=1&gen=${LPX}&mode=lens`)
    const s = state()
    expect(s.generation).toBe(LPX)
    expect(s.mode).toBe('explore')
    expect(s.lens.chapterIdx).toBe(-1)
    expect(lensById(NETWORK)!.chapters.some((c) => c.systemId === LPX)).toBe(false)
  })

  it('显式 mode=explore/compare → 章节保持清空，模式按显式值', () => {
    seed(`?lens=network&chapter=1&gen=${LPX}&mode=compare`)
    expect(state().mode).toBe('compare')
    expect(state().lens.chapterIdx).toBe(-1)
  })

  it('gen 与章节**同**代时不触发跨系统规则（照常停在该章）', () => {
    seed(`?lens=network&chapter=2&gen=${GB300}`)
    const s = state()
    expect(s.mode).toBe('lens')
    expect(s.lens.chapterIdx).toBe(1)
  })

  it('跨代 + mode=lens 时，后续显式 planes/level 仍能覆盖新章节', () => {
    seed(`?lens=network&chapter=1&gen=${VR}&mode=lens&planes=cooling&level=cluster`)
    expect(state().generation).toBe(VR)
    expect(state().lens.chapterIdx).toBe(VR_CHAPTER_IDX)
    expect(openPlanes()).toEqual(['cooling'])
    expect(state().level).toBe('cluster')
  })
})

describe('★ mode=lens 的接受条件：必须真的有激活章节', () => {
  it('单独的 ?mode=lens 被忽略（没有切面 = 空壳）', () => {
    seed('?mode=lens')
    expect(state().mode).toBe('explore')
    expect(state().lens.lensId).toBeNull()
  })

  it('?lens= 已经把模式置成 lens，?mode=lens 只是冗余确认', () => {
    seed('?lens=storage&chapter=2&mode=lens')
    expect(state().mode).toBe('lens')
    expect(state().lens).toEqual({ lensId: STORAGE, chapterIdx: 1 })
  })

  it('?tour= 与 ?mode=lens 同时出现时，切面被拒（导览基座照常）', () => {
    seed(`?tour=${NVLINK_TOUR}&mode=lens`)
    expect(state().mode).toBe('tour')
    expect(state().tourStopIdx).toBe(stopIdxOf(GB300, NVLINK_TOUR))
  })
})

describe('无 tour 的老行为不回归', () => {
  it('只有 gen 时不进导览态', () => {
    seed(`?gen=${VR}`)
    expect(state().mode).toBe('explore')
    expect(state().tourStopIdx).toBe(-1)
  })

  it('level + focus + planes 的经典深链照旧', () => {
    seed('?level=rack&focus=asm.gb300.rack&planes=nvlink,power')
    const s = state()
    expect(s.level).toBe('rack')
    expect(focusIdOf(s)).toBe('asm.gb300.rack')
    expect(openPlanes()).toEqual(['nvlink', 'power'])
    expect(s.mode).toBe('explore')
  })

  it('未知 gen 被忽略，代际保持不变', () => {
    seed('?gen=sys.nope')
    expect(state().generation).toBe(DEFAULT_SYSTEM_ID)
  })
})
