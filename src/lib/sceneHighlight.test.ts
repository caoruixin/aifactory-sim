/**
 * 导览场景高亮（v1.3 W2）。
 *
 * 两组东西在这里被钉住：
 *   1. `sceneHighlight.ts` 的派生逻辑——生效条件、系统内序号、按深度折叠；
 *   2. `palette.highlightKindOf` 的优先级链——四个通道**同时命中**同一个节点时谁赢。
 *      第 2 组是 v1.3 W2 的核心：在此之前 `Hotspot` 是「选中 > 悬停 > flow」、
 *      `RackInstances` 却是「悬停 > 选中」，两条渲染路径各写各的。现在只有一个裁决者。
 */

import { describe, expect, it } from 'vitest'
import { assemblyById, sceneById, scenesOfSystem } from '../data'
import {
  HIGHLIGHT_EMISSIVE,
  HIGHLIGHT_PRIORITY,
  HIGHLIGHT_TOKEN,
  PALETTE_FALLBACK,
  highlightKindOf,
} from './palette'
import type { HighlightKind } from './palette'
import { activeTourScene, sceneHighlightFocus, sceneHighlightSet } from './sceneHighlight'

const GB300 = 'sys.gb300-nvl72'
const VR = 'sys.vera-rubin-nvl72'

describe('activeTourScene：什么时候才算「正在导览」', () => {
  it('非 tour 模式一律没有场景高亮（explore/compare 下点开某一站的残留序号不生效）', () => {
    expect(activeTourScene('explore', GB300, 0)).toBeNull()
    expect(activeTourScene('compare', GB300, 0)).toBeNull()
  })

  it('tourStopIdx < 0（未选站 / 换代际后被清空）没有场景', () => {
    expect(activeTourScene('tour', GB300, -1)).toBeNull()
  })

  it('序号越界不抛异常，返回 null', () => {
    expect(activeTourScene('tour', GB300, 999)).toBeNull()
  })

  it('序号是**系统内**序号，不是全包全局序号', () => {
    const vrScenes = scenesOfSystem(VR)
    // 全包里 VR 的第 0 站排在 GB300 全部场景之后，用全局序号会取到 GB300 的站
    expect(activeTourScene('tour', VR, 0)!.id).toBe(vrScenes[0]!.id)
    expect(activeTourScene('tour', VR, 0)!.systemId).toBe(VR)
    const last = vrScenes.length - 1
    expect(activeTourScene('tour', VR, last)!.id).toBe('scene.rubin.learn-gen-delta')
  })

  it('GB300 前三站仍是讲解站，练习站全部追加在尾部（序号锁）', () => {
    const ids = scenesOfSystem(GB300).map((s) => s.id)
    expect(ids.slice(0, 3)).toEqual([
      'scene.gb300.cluster-overview',
      'scene.gb300.rack-anatomy',
      'scene.gb300.tray-teardown',
    ])
    expect(ids.slice(3).every((id) => id.startsWith('scene.gb300.learn-'))).toBe(true)
    expect(ids.slice(3)).toHaveLength(7)
  })
})

describe('sceneHighlightFocus：原始 ID → 当前深度下真的挂载的节点', () => {
  it('空场景 / 无高亮的场景一律空集合（不是抛错）', () => {
    expect(sceneHighlightFocus(null, 'rack')).toEqual({ chipIds: [], sceneHighlightIds: [] })
    expect(sceneHighlightFocus(undefined, 'cluster')).toEqual({ chipIds: [], sceneHighlightIds: [] })
    expect(
      sceneHighlightFocus({ ...sceneById('scene.gb300.rack-anatomy')!, highlightAssemblyIds: [] }, 'rack'),
    ).toEqual({ chipIds: [], sceneHighlightIds: [] })
  })

  it('chipIds 原样保序（内容作者写的就是讲解顺序）', () => {
    const scene = sceneById('scene.gb300.learn-plane-power')!
    expect(sceneHighlightFocus(scene, 'rack').chipIds).toEqual([
      'asm.gb300.power-shelf',
      'asm.gb300.busbar',
      'asm.gb300.facility-power',
    ])
  })

  it('板级件在机架深度折叠成它所在的托盘，并与显式写的托盘去重成一个', () => {
    const scene = sceneById('scene.gb300.learn-plane-scaleout')!
    // 场景写的是「网卡 + 托盘」两件
    expect(scene.highlightAssemblyIds).toEqual(['asm.gb300.cx8-nic', 'asm.gb300.compute-tray'])
    // 机架深度下网卡本身没挂载 → 折叠到计算托盘，与第二件重合，去重后只剩一个
    expect(sceneHighlightFocus(scene, 'rack').sceneHighlightIds).toEqual([
      'asm.gb300.compute-tray',
    ])
    // 板级深度下网卡自己就在场景里，两件都点亮
    expect(sceneHighlightFocus(scene, 'board').sceneHighlightIds).toEqual([
      'asm.gb300.cx8-nic',
      'asm.gb300.compute-tray',
    ])
  })

  it('集群级件（Leaf/Spine/汇聚）在任何深度都折叠回自身——它们本来就挂在集群层', () => {
    const scene = sceneById('scene.gb300.learn-switch-layers')!
    for (const depth of ['cluster', 'rack', 'board'] as const) {
      expect(sceneHighlightFocus(scene, depth).sceneHighlightIds).toEqual([
        'asm.gb300.scaleout-leaf',
        'asm.gb300.scaleout-spine',
        'asm.gb300.converged-switch',
      ])
    }
  })

  it('六个 learn-plane 站的高亮件全部存在、且都属于 GB300（渲染端不会拿到孤儿 ID）', () => {
    for (const scene of scenesOfSystem(GB300).filter((s) => s.id.includes('learn-plane'))) {
      expect(scene.highlightAssemblyIds.length, scene.id).toBeGreaterThan(0)
      for (const id of scene.highlightAssemblyIds) {
        expect(assemblyById(id)?.systemId, `${scene.id} → ${id}`).toBe(GB300)
      }
      // 单平面练习站：一站只开一个平面，这是「逐个开关」的教学前提
      expect(scene.planes, scene.id).toHaveLength(1)
      expect(scene.lodLevel, scene.id).toBe('rack')
      expect(scene.focusAssemblyId, scene.id).toBe('asm.gb300.rack')
    }
  })
})

describe('sceneHighlightSet：store 三字段 + 深度 → 渲染端集合', () => {
  it('非导览态返回 null（渲染端据此完全跳过场景通道）', () => {
    expect(sceneHighlightSet('explore', GB300, 3, 'rack')).toBeNull()
    expect(sceneHighlightSet('tour', GB300, -1, 'rack')).toBeNull()
  })

  it('导览态返回折叠后的集合', () => {
    const idx = scenesOfSystem(GB300).findIndex((s) => s.id === 'scene.gb300.learn-plane-nvlink')
    const set = sceneHighlightSet('tour', GB300, idx, 'rack')
    expect(set).not.toBeNull()
    expect(set!.has('asm.gb300.compute-tray')).toBe(true)
    expect(set!.has('asm.gb300.nvswitch-tray')).toBe(true)
    // 背板不占 U 位但确实是机架级节点，同样在集合里
    expect(set!.has('asm.gb300.nvlink-backplane')).toBe(true)
    expect(set!.has('asm.gb300.power-shelf')).toBe(false)
  })
})

describe('高亮优先级链：selected > hovered > flow > scene', () => {
  it('优先级表就是这四档，顺序不可改', () => {
    expect(HIGHLIGHT_PRIORITY).toEqual(['selected', 'hovered', 'flow', 'scene'])
  })

  it('全部未命中 → null（用部件本色）', () => {
    expect(highlightKindOf({})).toBeNull()
    expect(highlightKindOf({ selected: false, hovered: false, flow: false, scene: false })).toBeNull()
  })

  it('单通道命中 → 就是它', () => {
    for (const kind of HIGHLIGHT_PRIORITY) {
      expect(highlightKindOf({ [kind]: true })).toBe(kind)
    }
  })

  it('穷举 16 种重叠组合，结果恒等于「最高优先级的那个命中通道」', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const active: Record<string, boolean> = {}
      HIGHLIGHT_PRIORITY.forEach((kind, i) => {
        active[kind] = (mask & (1 << i)) !== 0
      })
      const expected = HIGHLIGHT_PRIORITY.find((k) => active[k]) ?? null
      expect(highlightKindOf(active), `mask=${mask} ${JSON.stringify(active)}`).toBe(expected)
    }
  })

  it('点名几组最容易写反的组合', () => {
    // v1.3 之前 RackInstances 正是这一条反着写的
    expect(highlightKindOf({ selected: true, hovered: true })).toBe('selected')
    // 用户点的那一件正好也是本站讲解对象 → 仍按「选中」渲染
    expect(highlightKindOf({ selected: true, scene: true })).toBe('selected')
    // 数据流当前步与导览当前站同时命中 → 数据流赢（它才是「正在发生的事」）
    expect(highlightKindOf({ flow: true, scene: true })).toBe('flow')
    expect(highlightKindOf({ hovered: true, flow: true, scene: true })).toBe('hovered')
  })

  it('四档都有 palette token 与自发光强度，且场景高亮比选中淡', () => {
    for (const kind of HIGHLIGHT_PRIORITY) {
      expect(PALETTE_FALLBACK[HIGHLIGHT_TOKEN[kind]], kind).toBeTruthy()
      expect(HIGHLIGHT_EMISSIVE[kind], kind).toBeGreaterThan(0)
    }
    expect(HIGHLIGHT_EMISSIVE.scene).toBeLessThan(HIGHLIGHT_EMISSIVE.selected)
    // 颜色本身不新造：场景高亮复用 accent（与选中同色、靠强度区分）
    const tokens = new Set<HighlightKind>(HIGHLIGHT_PRIORITY)
    expect(tokens.size).toBe(4)
    expect(HIGHLIGHT_TOKEN.scene).toBe('accent')
  })
})
