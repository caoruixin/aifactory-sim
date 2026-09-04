/**
 * 领域切面的派生逻辑（v1.6 W-B）。
 *
 * 这里钉住四件事：章节解析（含深链短名）、平面开关换算、**门条件**（什么时候算
 * 「正在看切面」）、偏离判定。外加一组内容层不变量：因果链的每个 roleKey 都能在
 * 本章 systemId 内解析成真实装配 ID、每个 crossRef 都能定位到真实章节
 * ——渲染端拿到 null 会静默少一个 chip，比红灯难查得多。
 */

import { describe, expect, it } from 'vitest'
import { FACTORY_PACK, assemblyById, lensById } from '../data'
import type { LensChapter, NetworkPlane } from '../data/types'
import {
  DEFAULT_LENS_ID,
  TECHNIQUE_CATEGORY_LABEL,
  activeLensChapter,
  assemblyIdOfRoleKey,
  chainHardwareRefs,
  chapterPlaneFlags,
  isChapterStateDirty,
  lensChapterAt,
  lensChapterCount,
  locateChapter,
  resolveLensId,
  shortSystemName,
  shortSystemNameOf,
} from './lens'
import { PLANE_ORDER } from './palette'

const NETWORK = 'lens.network'
const STORAGE = 'lens.storage'
const GB300 = 'sys.gb300-nvl72'

function allChapters(): { lensId: string; idx: number; chapter: LensChapter }[] {
  return FACTORY_PACK.lenses.flatMap((lens) =>
    lens.chapters.map((chapter, idx) => ({ lensId: lens.id, idx, chapter })),
  )
}

/** 章节自身要求的视角（`isChapterStateDirty` 应判为「未偏离」的那一组）。 */
function viewOf(chapter: LensChapter) {
  return {
    level: chapter.lodLevel,
    focusPath: chapter.focusAssemblyId ? ['root', chapter.focusAssemblyId] : ['root'],
    planes: chapterPlaneFlags(chapter),
  }
}

describe('resolveLensId：深链短名与全 id 都接受', () => {
  it('短名补前缀', () => {
    expect(resolveLensId('network')).toBe(NETWORK)
    expect(resolveLensId('storage')).toBe(STORAGE)
  })

  it('全 id 原样通过，前后空白容错', () => {
    expect(resolveLensId(NETWORK)).toBe(NETWORK)
    expect(resolveLensId(' lens.storage ')).toBe(STORAGE)
  })

  it('未知值 / 空值一律 null（深链写错不打崩界面）', () => {
    expect(resolveLensId('nope')).toBeNull()
    expect(resolveLensId('lens.nope')).toBeNull()
    expect(resolveLensId('')).toBeNull()
    expect(resolveLensId(null)).toBeNull()
    expect(resolveLensId(undefined)).toBeNull()
  })

  it('默认切面就是内容包里的第一条', () => {
    expect(DEFAULT_LENS_ID).toBe(FACTORY_PACK.lenses[0]!.id)
    expect(lensById(DEFAULT_LENS_ID)).toBeDefined()
  })
})

describe('lensChapterAt / lensChapterCount', () => {
  it('按 lens 内序号取章（不是全包全局序号）', () => {
    expect(lensChapterAt(NETWORK, 0)!.id).toBe('lens.network.nvlink-domain')
    expect(lensChapterAt(STORAGE, 0)!.id).toBe('lens.storage.model-distribution')
    // 两条切面的第 0 章各是自己的第一章——序号绝不跨 lens 复用
    expect(lensChapterAt(NETWORK, 0)!.id).not.toBe(lensChapterAt(STORAGE, 0)!.id)
  })

  it('越界 / 负数 / 非整数 / 未知 lens 一律 null', () => {
    expect(lensChapterAt(NETWORK, 99)).toBeNull()
    expect(lensChapterAt(NETWORK, -1)).toBeNull()
    expect(lensChapterAt(NETWORK, 1.5)).toBeNull()
    expect(lensChapterAt('lens.nope', 0)).toBeNull()
    expect(lensChapterAt(null, 0)).toBeNull()
  })

  it('章节数与内容包一致', () => {
    expect(lensChapterCount(NETWORK)).toBe(lensById(NETWORK)!.chapters.length)
    expect(lensChapterCount('lens.nope')).toBe(0)
    expect(lensChapterCount(null)).toBe(0)
  })
})

describe('chapterPlaneFlags：章节 planes → 六个开关', () => {
  it('列出的开、其余关，六个键一个不少', () => {
    const chapter = lensChapterAt(NETWORK, 0)!
    const flags = chapterPlaneFlags(chapter)
    expect(Object.keys(flags).sort()).toEqual([...PLANE_ORDER].sort())
    expect(flags.nvlink).toBe(true)
    expect(Object.entries(flags).filter(([, on]) => on).map(([p]) => p)).toEqual(chapter.planes)
  })

  it('全部章节：开着的那一组恒等于 chapter.planes', () => {
    for (const { chapter } of allChapters()) {
      const on = PLANE_ORDER.filter((p) => chapterPlaneFlags(chapter)[p])
      expect(on.sort(), chapter.id).toEqual([...chapter.planes].sort())
    }
  })
})

describe('activeLensChapter：什么时候才算「正在看切面」', () => {
  it('非 lens 模式一律为 null（退出切面后残留的序号不生效）', () => {
    for (const mode of ['explore', 'compare', 'tour']) {
      expect(activeLensChapter(mode, { lensId: NETWORK, chapterIdx: 0 }), mode).toBeNull()
    }
  })

  it('chapterIdx < 0（换代后被清空）没有章节', () => {
    expect(activeLensChapter('lens', { lensId: NETWORK, chapterIdx: -1 })).toBeNull()
  })

  it('lensId 为空 / lens 状态缺失同样为 null', () => {
    expect(activeLensChapter('lens', { lensId: null, chapterIdx: 0 })).toBeNull()
    expect(activeLensChapter('lens', null)).toBeNull()
    expect(activeLensChapter('lens', undefined)).toBeNull()
  })

  it('越界序号不抛异常', () => {
    expect(activeLensChapter('lens', { lensId: NETWORK, chapterIdx: 999 })).toBeNull()
  })

  it('命中时返回该章', () => {
    expect(activeLensChapter('lens', { lensId: STORAGE, chapterIdx: 2 })!.id).toBe(
      'lens.storage.kv-runtime',
    )
  })
})

describe('isChapterStateDirty：偏离本章视角的判定', () => {
  it('全部章节：本章自己的视角判为「未偏离」', () => {
    for (const { chapter } of allChapters()) {
      expect(isChapterStateDirty(chapter, viewOf(chapter)), chapter.id).toBe(false)
    }
  })

  it('层级不同 → 偏离', () => {
    const chapter = lensChapterAt(NETWORK, 0)! // rack 级
    expect(isChapterStateDirty(chapter, { ...viewOf(chapter), level: 'board' })).toBe(true)
  })

  it('焦点不同 → 偏离', () => {
    const chapter = lensChapterAt(NETWORK, 0)!
    expect(
      isChapterStateDirty(chapter, { ...viewOf(chapter), focusPath: ['asm.gb300.compute-tray'] }),
    ).toBe(true)
  })

  it('任一平面开关不同 → 偏离', () => {
    const chapter = lensChapterAt(NETWORK, 0)!
    const planes = { ...chapterPlaneFlags(chapter), power: true }
    expect(isChapterStateDirty(chapter, { ...viewOf(chapter), planes })).toBe(true)
  })

  it('★ focusAssemblyId 为 null 的纯叙事章不比焦点（否则永远判成已偏离）', () => {
    const chapter = allChapters().find(({ chapter: c }) => c.focusAssemblyId === null)!.chapter
    expect(chapter.id).toBe('lens.storage.rag-l4')
    expect(
      isChapterStateDirty(chapter, { ...viewOf(chapter), focusPath: ['asm.gb300.b300-gpu'] }),
    ).toBe(false)
    // 层级与平面照旧参与判定
    expect(isChapterStateDirty(chapter, { ...viewOf(chapter), level: 'board' })).toBe(true)
  })

  it('缺失的平面键当作「关」处理，不抛异常', () => {
    const chapter = lensChapterAt(NETWORK, 0)!
    const planes = {} as Record<NetworkPlane, boolean>
    expect(isChapterStateDirty(chapter, { ...viewOf(chapter), planes })).toBe(true)
  })
})

describe('roleKey → 装配 ID（跨代语义键，永不解析 ID 字符串）', () => {
  it('本系统内解析', () => {
    expect(assemblyIdOfRoleKey(GB300, 'nvswitch-tray')).toBe('asm.gb300.nvswitch-tray')
    expect(assemblyIdOfRoleKey('sys.hgx-b300', 'scaleout-nic')).not.toBeNull()
  })

  it('不存在的角色 / 不存在的系统 → null', () => {
    expect(assemblyIdOfRoleKey(GB300, 'nope')).toBeNull()
    expect(assemblyIdOfRoleKey('sys.nope', 'rack')).toBeNull()
  })

  it('★ 同一角色在不同代际解析到各自的节点（不串代）', () => {
    const a = assemblyIdOfRoleKey(GB300, 'nvswitch-tray')!
    const b = assemblyIdOfRoleKey('sys.vera-rubin-nvl72', 'nvswitch-tray')!
    expect(a).not.toBe(b)
    expect(assemblyById(a)!.systemId).toBe(GB300)
    expect(assemblyById(b)!.systemId).toBe('sys.vera-rubin-nvl72')
  })
})

describe('内容层不变量：因果链锚点与代际对照跳转', () => {
  it('★ 每条 ChainLink 的每个 roleKey 都能在本章 systemId 内解析（渲染端不会少 chip）', () => {
    for (const { chapter } of allChapters()) {
      for (const link of chapter.chain) {
        for (const ref of chainHardwareRefs(chapter, link)) {
          expect(ref.assemblyId, `${chapter.id} / ${link.id} / ${ref.roleKey}`).not.toBeNull()
          expect(assemblyById(ref.assemblyId!)!.systemId).toBe(chapter.systemId)
        }
      }
    }
  })

  it('chainHardwareRefs 保序去重；空数组（L4 叙事行）返回空', () => {
    const chapter = lensChapterAt(NETWORK, 0)!
    const link = chapter.chain[0]!
    expect(chainHardwareRefs(chapter, link).map((r) => r.roleKey)).toEqual(link.hardwareRoleKeys)
    expect(
      chainHardwareRefs(chapter, { ...link, hardwareRoleKeys: ['nvswitch-tray', 'nvswitch-tray'] }),
    ).toHaveLength(1)
    expect(chainHardwareRefs(chapter, { ...link, hardwareRoleKeys: [] })).toEqual([])
  })

  it('★ 每个 crossRef 都能定位到真实章节（跳转不会落空）', () => {
    for (const { chapter } of allChapters()) {
      for (const ref of chapter.crossRefs) {
        const loc = locateChapter(ref.chapterId)
        expect(loc, `${chapter.id} → ${ref.chapterId}`).not.toBeNull()
        expect(lensChapterAt(loc!.lensId, loc!.chapterIdx)!.id).toBe(ref.chapterId)
      }
    }
  })

  it('locateChapter 未知章节返回 null', () => {
    expect(locateChapter('lens.network.nope')).toBeNull()
  })
})

describe('TECHNIQUE_CATEGORY_LABEL 全枚举', () => {
  it('内容包里用到的每个类别都有中文名，且没有空标签', () => {
    for (const tech of FACTORY_PACK.techniques) {
      expect(TECHNIQUE_CATEGORY_LABEL[tech.category], tech.id).toBeTruthy()
    }
    const labels = Object.values(TECHNIQUE_CATEGORY_LABEL)
    expect(labels).toHaveLength(6)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('代际短名', () => {
  it('去掉厂商前缀与预测后缀', () => {
    expect(shortSystemName('NVIDIA GB300 NVL72')).toBe('GB300 NVL72')
    expect(shortSystemName('NVIDIA Rubin Ultra NVL576（预测）')).toBe('Rubin Ultra NVL576')
  })

  it('按 systemId 取；未知系统回落显示 id', () => {
    expect(shortSystemNameOf(GB300)).toBe(shortSystemName(FACTORY_PACK.systems[0]!.name))
    expect(shortSystemNameOf('sys.nope')).toBe('sys.nope')
  })
})
